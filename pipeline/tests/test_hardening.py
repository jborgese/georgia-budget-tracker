from __future__ import annotations

import json
import urllib.error

import pytest

import check_sources
import etl_population
import etl_state
import fetching
import report_failures
import runlog


@pytest.fixture
def state_file(tmp_path):
    return tmp_path / ".source-state.json"


def test_record_outcome_counts_and_resets(state_file):
    assert runlog.record_outcome("src", ok=False, error="boom",
                                 state_file=state_file) == 1
    assert runlog.record_outcome("src", ok=False, error="boom again",
                                 state_file=state_file) == 2
    state = json.loads(state_file.read_text())
    assert state["src"]["consecutive_failures"] == 2
    assert "boom again" in state["src"]["last_error"]

    assert runlog.record_outcome("src", ok=True, state_file=state_file) == 0
    assert "consecutive_failures" not in json.loads(state_file.read_text())["src"]


def test_record_outcome_preserves_fingerprint(state_file):
    state_file.write_text(json.dumps(
        {"src": {"fingerprint": {"etag": "abc"}, "checked_at": "t"}}))
    runlog.record_outcome("src", ok=False, error="x", state_file=state_file)
    entry = json.loads(state_file.read_text())["src"]
    assert entry["fingerprint"] == {"etag": "abc"}
    assert entry["consecutive_failures"] == 1


def test_failing_sources_threshold(state_file):
    for _ in range(3):
        runlog.record_outcome("bad", ok=False, error="x", state_file=state_file)
    runlog.record_outcome("flaky", ok=False, error="x", state_file=state_file)
    failing = runlog.failing_sources(3, state_file=state_file)
    assert list(failing) == ["bad"]


def test_log_event_emits_json_lines(capsys):
    runlog.log_event("fetched", "src", bytes=42, note=None)
    record = json.loads(capsys.readouterr().out.strip())
    assert record == {"event": "fetched", "source": "src", "bytes": 42}


def test_call_with_retries_recovers(monkeypatch):
    monkeypatch.setattr(fetching.time, "sleep", lambda _: None)
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise OSError("transient")
        return "ok"

    assert fetching.call_with_retries(flaky, source="s", description="d") == "ok"
    assert len(calls) == 3


def test_call_with_retries_exhausts_attempts(monkeypatch):
    monkeypatch.setattr(fetching.time, "sleep", lambda _: None)

    def always_fails():
        raise OSError("down")

    with pytest.raises(OSError):
        fetching.call_with_retries(always_fails, source="s", description="d",
                                   attempts=3)


def test_call_with_retries_respects_budget(monkeypatch):
    slept = []
    monkeypatch.setattr(fetching.time, "sleep", slept.append)
    attempts = []

    def always_fails():
        attempts.append(1)
        raise OSError("down")

    with pytest.raises(OSError):
        fetching.call_with_retries(always_fails, source="s", description="d",
                                   attempts=10, base_delay=100.0, budget=50.0)
    assert len(attempts) == 1
    assert not slept


class FakeResponse:
    def __init__(self, chunks, fail_after=None):
        self.chunks = chunks
        self.fail_after = fail_after

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        return None

    def iter_bytes(self):
        for index, chunk in enumerate(self.chunks):
            if self.fail_after is not None and index >= self.fail_after:
                raise OSError("connection dropped")
            yield chunk


def test_download_file_retries_and_cleans_partials(tmp_path, monkeypatch):
    monkeypatch.setattr(fetching.time, "sleep", lambda _: None)
    destination = tmp_path / "file.bin"
    responses = [FakeResponse([b"ab", b"cd"], fail_after=1),
                 FakeResponse([b"ab", b"cd"])]
    monkeypatch.setattr(fetching.httpx, "stream",
                        lambda *a, **k: responses.pop(0))
    fetching.download_file("http://x/file", destination, source="s")
    assert destination.read_bytes() == b"abcd"
    assert not destination.with_suffix(".bin.part").exists()


def test_download_file_terminal_failure_leaves_no_partial(tmp_path, monkeypatch):
    monkeypatch.setattr(fetching.time, "sleep", lambda _: None)
    destination = tmp_path / "file.bin"
    monkeypatch.setattr(fetching.httpx, "stream",
                        lambda *a, **k: FakeResponse([b"x"], fail_after=0))
    with pytest.raises(OSError):
        fetching.download_file("http://x/file", destination, source="s",
                               attempts=2)
    assert not destination.exists()
    assert not destination.with_suffix(".bin.part").exists()


def test_check_sources_isolates_failing_source(tmp_path, monkeypatch):
    sources_file = tmp_path / "sources.json"
    sources_file.write_text(json.dumps({"sources": [
        {"id": "good", "url": "http://good"},
        {"id": "bad", "url": "http://bad"},
    ]}))
    state_file = tmp_path / "state.json"
    monkeypatch.setattr(check_sources, "SOURCES_FILE", sources_file)
    monkeypatch.setattr(check_sources, "STATE_FILE", state_file)
    monkeypatch.setattr(check_sources.time, "sleep", lambda _: None)

    def fake_fingerprint(url, check="http"):
        if "bad" in url:
            raise urllib.error.URLError("refused")
        return {"etag": "v1"}

    monkeypatch.setattr(check_sources, "fingerprint", fake_fingerprint)

    assert check_sources.main() == 0
    state = json.loads(state_file.read_text())
    assert state["good"]["fingerprint"] == {"etag": "v1"}
    assert state["bad"]["consecutive_failures"] == 1

    assert check_sources.main() == 0
    state = json.loads(state_file.read_text())
    assert state["bad"]["consecutive_failures"] == 2
    assert "consecutive_failures" not in state["good"]


def fake_opb_record(source_id):
    return {"entity": "STATE OF GEORGIA", "fiscal_year": 2024,
            "category": "revenue", "section": "state_general_fund_receipts",
            "classification": "Income Tax", "depth": 3, "line": 0,
            "path": "State General Fund Receipts > Net Taxes > Income Tax",
            "amount": 100.0, "basis": "reported", "source": source_id}


def test_etl_state_isolates_dataset_failures(tmp_path, monkeypatch):
    opb_id = etl_state.OPB_REPORTS[0]
    monkeypatch.setattr(etl_state, "PARQUET_FILE", tmp_path / "state.parquet")
    monkeypatch.setattr(etl_state, "MANIFEST_FILE", tmp_path / "manifest.json")
    monkeypatch.setattr(etl_state, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(runlog, "STATE_FILE", tmp_path / ".source-state.json")
    monkeypatch.setattr(etl_state.sys, "argv", ["etl_state.py"])

    def broken_openga():
        raise RuntimeError("open georgia is down")

    monkeypatch.setattr(etl_state, "refresh_openga", broken_openga)
    monkeypatch.setattr(etl_state, "refresh_opb_report",
                        lambda sources, sid: [fake_opb_record(sid)])
    monkeypatch.setattr(etl_state, "load_sources", lambda: {})

    assert etl_state.main() == 1
    assert (tmp_path / "state.parquet").exists()
    state = json.loads((tmp_path / ".source-state.json").read_text())
    assert state[etl_state.OPENGA_SOURCE]["consecutive_failures"] == 1
    assert "consecutive_failures" not in state.get(opb_id, {})


def test_etl_state_all_failures_leaves_outputs_untouched(tmp_path, monkeypatch):
    monkeypatch.setattr(etl_state, "PARQUET_FILE", tmp_path / "state.parquet")
    monkeypatch.setattr(runlog, "STATE_FILE", tmp_path / ".source-state.json")
    monkeypatch.setattr(etl_state.sys, "argv", ["etl_state.py"])

    def broken(*args, **kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(etl_state, "refresh_openga", broken)
    monkeypatch.setattr(etl_state, "refresh_opb_report", broken)
    monkeypatch.setattr(etl_state, "load_sources", lambda: {})

    assert etl_state.main() == 1
    assert not (tmp_path / "state.parquet").exists()


def census_csv(fips_codes):
    lines = ["SUMLEV,STATE,COUNTY,STNAME,CTYNAME,POPESTIMATE2020"]
    lines += [f"050,13,{fips[2:]},Georgia,X County,100" for fips in fips_codes]
    return "\n".join(lines) + "\n"


def place_csv() -> str:
    return "\n".join([
        "SUMLEV,STATE,NAME,POPESTIMATE2020,POPESTIMATE2021",
        "162,13,Abbeville city,2500,2510",
        "162,13,Pine Lake city,700,705",
        "050,13,Appling County,18000,18100",
    ]) + "\n"


def test_etl_population_falls_back_to_committed_raw(tmp_path, monkeypatch):
    import schema as contract

    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    text = census_csv(sorted(contract.COUNTY_FIPS.values()))
    for source_id in etl_population.SOURCE_IDS:
        (raw_dir / f"{source_id}.csv").write_text(text, encoding="latin-1")
    for source_id in etl_population.PLACE_SOURCE_IDS:
        (raw_dir / f"{source_id}.csv").write_text(
            place_csv(), encoding="latin-1")

    all_ids = [*etl_population.SOURCE_IDS, *etl_population.PLACE_SOURCE_IDS]
    monkeypatch.setattr(etl_population, "RAW_DIR", raw_dir)
    monkeypatch.setattr(etl_population, "OUTPUT_FILE", tmp_path / "pop.json")
    monkeypatch.setattr(etl_population, "CITY_OUTPUT_FILE",
                        tmp_path / "citypop.json")
    monkeypatch.setattr(runlog, "STATE_FILE", tmp_path / ".source-state.json")
    monkeypatch.setattr(etl_population.sys, "argv", ["etl_population.py"])
    monkeypatch.setattr(etl_population, "source_urls",
                        lambda: {sid: "http://x" for sid in all_ids})

    def broken_download(*args, **kwargs):
        raise OSError("census unreachable")

    monkeypatch.setattr(etl_population, "download_file", broken_download)

    assert etl_population.main() == 1
    assert (tmp_path / "pop.json").exists()
    city_doc = json.loads((tmp_path / "citypop.json").read_text())
    assert city_doc["populations"]["PINE LAKE"]["2021"] == 705
    state = json.loads((tmp_path / ".source-state.json").read_text())
    assert all(state[sid]["consecutive_failures"] == 1 for sid in all_ids)


@pytest.fixture
def gh_recorder(monkeypatch):
    calls = []
    responses = {"list": "[]"}

    def fake_run(args, check, text, capture_output=False):
        calls.append(args)
        class Result:
            stdout = responses["list"] if args[1] == "issue" and args[2] == "list" \
                else ""
        return Result()

    monkeypatch.setattr(report_failures.subprocess, "run", fake_run)
    return calls, responses


def test_report_creates_issue_at_threshold(tmp_path, monkeypatch, gh_recorder):
    calls, responses = gh_recorder
    state_file = tmp_path / "state.json"
    for _ in range(3):
        runlog.record_outcome("ted_rlgf_county_workbook", ok=False,
                              error="HTTP 503", state_file=state_file)
    monkeypatch.setattr(runlog, "STATE_FILE", state_file)

    assert report_failures.main() == 0
    commands = [call[1:3] for call in calls]
    assert ["issue", "create"] in commands
    assert ["issue", "edit"] not in commands


def test_report_updates_existing_issue(tmp_path, monkeypatch, gh_recorder):
    calls, responses = gh_recorder
    responses["list"] = json.dumps([{"number": 7}])
    state_file = tmp_path / "state.json"
    for _ in range(4):
        runlog.record_outcome("open_georgia_poa", ok=False, error="timeout",
                              state_file=state_file)
    monkeypatch.setattr(runlog, "STATE_FILE", state_file)

    assert report_failures.main() == 0
    commands = [call[1:3] for call in calls]
    assert ["issue", "edit"] in commands
    assert ["issue", "create"] not in commands


def test_report_closes_issue_after_recovery(tmp_path, monkeypatch, gh_recorder):
    calls, responses = gh_recorder
    responses["list"] = json.dumps([{"number": 7}])
    state_file = tmp_path / "state.json"
    runlog.record_outcome("open_georgia_poa", ok=True, state_file=state_file)
    monkeypatch.setattr(runlog, "STATE_FILE", state_file)

    assert report_failures.main() == 0
    commands = [call[1:3] for call in calls]
    assert ["issue", "close"] in commands


def test_report_noop_below_threshold(tmp_path, monkeypatch, gh_recorder):
    calls, responses = gh_recorder
    state_file = tmp_path / "state.json"
    runlog.record_outcome("open_georgia_poa", ok=False, error="x",
                          state_file=state_file)
    monkeypatch.setattr(runlog, "STATE_FILE", state_file)

    assert report_failures.main() == 0
    commands = [call[1:3] for call in calls]
    assert commands == [["issue", "list"]]
