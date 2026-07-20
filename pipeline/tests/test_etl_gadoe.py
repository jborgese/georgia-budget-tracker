from __future__ import annotations

import openpyxl
import pytest

import etl_gadoe
import gadoe

MENU_HTML = """
<form method="post" action="./ReportsMenuPublic.aspx" id="form1">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc+/=" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="xyz" />
<select name="ddlFiscalYear" id="ddlFiscalYear">
\t<option selected="selected" value="0">Select Fiscal Year</option>
\t<option value="14">2025</option>
\t<option value="5">2012</option>
</select>
<select name="ddlSystem" id="ddlSystem">
\t<option selected="selected" value="0">Select System</option>
\t<option value="-1">All Systems</option>
</select>
<select name="ddlReports" id="ddlReports">
\t<option value="0">Select Report</option>
\t<option value="42">School System Revenues</option>
</select>
</form>
"""

REPORT_PAGE = (
    '{"ExportUrlBase":"/FinancialPublicWeb/Reserved.ReportViewerWebControl.axd'
    '?ReportSession=abc123\\u0026ControlID=def456\\u0026OpType=Export'
    '\\u0026FileName=WebRevenue\\u0026Format="}'
)

CSV_HEADER = ("SystemID,SystemName,ColumnName,Textbox92,Textbox93,Textbox94,"
              "Textbox74,Textbox75,Textbox76")


def csv_row(code: str, column: str, value: str, total: str = "9") -> str:
    return f" {code},Some System,{column},{value},1,2,{total},4,5"


def test_hidden_fields_reads_all_hidden_inputs():
    fields = gadoe.hidden_fields(MENU_HTML)
    assert fields == {"__VIEWSTATE": "abc+/=", "__EVENTVALIDATION": "xyz"}


def test_year_values_maps_labels_to_option_values():
    assert gadoe.year_values(MENU_HTML) == {2025: "14", 2012: "5"}


def test_select_options_missing_select_raises_layout_error():
    with pytest.raises(gadoe.PortalLayoutError):
        gadoe.select_options(MENU_HTML, "ddlNope")


def test_export_url_unescapes_base_and_appends_format():
    url = gadoe.export_url(REPORT_PAGE, "EXCELOPENXML")
    assert url == (
        "https://financeweb.doe.k12.ga.us/FinancialPublicWeb/"
        "Reserved.ReportViewerWebControl.axd?ReportSession=abc123"
        "&ControlID=def456&OpType=Export&FileName=WebRevenue"
        "&Format=EXCELOPENXML")


def test_export_url_missing_base_raises_layout_error():
    with pytest.raises(gadoe.PortalLayoutError):
        gadoe.export_url("<html>no report here</html>", "CSV")


def test_csv_digest_tracks_system_values_only():
    legend = "100,General Fund"
    base = "\n".join([CSV_HEADER, csv_row("601", "Local Revenues", "10"),
                      legend])
    value_changed = "\n".join([CSV_HEADER, csv_row("601", "Local Revenues", "11"),
                               legend])
    totals_changed = "\n".join([CSV_HEADER,
                                csv_row("601", "Local Revenues", "10", total="8"),
                                "200,Debt Service Fund"])
    assert gadoe.csv_digest(base) != gadoe.csv_digest(value_changed)
    assert gadoe.csv_digest(base) == gadoe.csv_digest(totals_changed)


def test_csv_digest_without_system_rows_raises_layout_error():
    with pytest.raises(gadoe.PortalLayoutError):
        gadoe.csv_digest("\n".join([CSV_HEADER, "100,General Fund"]))


@pytest.mark.parametrize(("gadoe_name", "f33_name"), [
    ("Appling County", "Appling County School District"),
    ("City Schools of Decatur", "Decatur Independent School District"),
    ("Decatur County", "Decatur County School District"),
    ("Americus City", "Americus Independent School District"),
    ("Atlanta Public Schools", "Atlanta Public Schools"),
    ("Savannah-Chatham County", "Savannah-chatham County Public School System"),
    ("Bremen City", "Bremen City Schools"),
])
def test_match_key_joins_gadoe_and_f33_names(gadoe_name, f33_name):
    assert etl_gadoe.match_key(gadoe_name) == etl_gadoe.match_key(f33_name)


def test_match_key_keeps_county_and_city_systems_apart():
    county = etl_gadoe.match_key("Decatur County School District")
    city = etl_gadoe.match_key("Decatur Independent School District")
    assert county != city


DISTRICTS = [
    {"display_name": "Appling County School District", "ncesid": "1300060",
     "slug": "appling-county-school-district"},
    {"display_name": "Decatur Independent School District", "ncesid": "1301680",
     "slug": "decatur-independent-school-district"},
    {"display_name": "Griffin Spalding School District", "ncesid": "1302460",
     "slug": "griffin-spalding-school-district"},
]


def system(code: str, name: str) -> dict:
    return {"fiscal_year": 2025, "system_code": code, "system_name": name}


def test_map_systems_matches_aliases_and_skips_known_and_charters():
    mapping = etl_gadoe.map_systems(
        [system("601", "Appling County"),
         system("644", "City Schools of Decatur"),
         system("726", "Griffin-Spalding County"),
         system("630", "Clay County"),
         system("7820108", "State Specialty Schools I-Mountain Education")],
        DISTRICTS)
    assert {code: entry["ncesid"] for code, entry in mapping.items()} == {
        "601": "1300060", "644": "1301680", "726": "1302460"}


def test_map_systems_unknown_regular_system_fails_loudly():
    with pytest.raises(SystemExit, match="999 Nowhere County"):
        etl_gadoe.map_systems([system("999", "Nowhere County")], DISTRICTS)


def test_map_systems_known_unmatched_that_matches_fails_loudly():
    districts = DISTRICTS + [{"display_name": "Clay County School District",
                              "ncesid": "1301200", "slug": "clay"}]
    with pytest.raises(SystemExit, match="now match"):
        etl_gadoe.map_systems([system("630", "Clay County")], districts)


def test_map_systems_duplicate_ncesid_claim_fails_loudly():
    with pytest.raises(SystemExit, match="both"):
        etl_gadoe.map_systems(
            [system("601", "Appling County"),
             system("602", "Appling County School District")],
            DISTRICTS)


def workbook_path(tmp_path, fiscal_year=2025):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append([None, "Georgia Department of Education"])
    sheet.append([None, "School System Revenues\n"
                        f"Fiscal Year {fiscal_year} Financial Data Collection "
                        "System"])
    sheet.append([None, "Please note: Systems marked with * ..."])
    sheet.append([None, "System ID", "System Name",
                  f"FTE Reported on {fiscal_year} QBE Allotments",
                  "Local Revenues", "Per FTE Local", "% Local",
                  "State Revenues", "Per FTE State", "% State",
                  "Federal Revenues", "Per FTE Federal", "% Federal",
                  "Total Revenues", "Per FTE Total Revenues"])
    sheet.append([None, " 601", "Appling County", "3266", "18751117.94",
                  "5741.31", "39.42", "24478894.56", "7495.07", "51.46",
                  "4339362.74", "1328.65", "9.12", "47569375.24", "14565.03"])
    sheet.append([None, " 602", "Atkinson County *", 1557, 3570825.33,
                  2293.4, 16.14, 16505820.27, 10601.04, 74.58,
                  2053660.94, 1318.99, 9.28, 22130306.54, 14213.43])
    sheet.append([None, " State Total", None, "1,744,600", "22,321,943.27",
                  "12.79", "100", "40,984,714.83", "23.49", "58.83",
                  "6,393,023.68", "3.66", "9.18", "69,699,681.78", "39.95"])
    path = tmp_path / "gadoe_revenues_2025.xlsx"
    workbook.save(path)
    return path


def test_parse_workbook_extracts_systems_and_statewide(tmp_path):
    records, statewide = etl_gadoe.parse_workbook(workbook_path(tmp_path), 2025)
    assert [record["system_code"] for record in records] == ["601", "602"]
    assert records[1]["system_name"] == "Atkinson County"
    assert records[0]["fte"] == 3266
    assert records[0]["revenue_local"] == 18751117.94
    assert records[1]["per_fte_total"] == 14213.43
    assert statewide["fte"] == 1744600
    assert statewide["revenue_total"] == 69699681.78
    assert "per_fte_total" not in statewide


def test_parse_workbook_rejects_fiscal_year_mismatch(tmp_path):
    with pytest.raises(SystemExit, match="expected 2024"):
        etl_gadoe.parse_workbook(workbook_path(tmp_path, fiscal_year=2025), 2024)


def test_statewide_entry_recomputes_per_fte():
    entry = etl_gadoe.statewide_entry({
        "fte": 200, "revenue_local": 100.0, "revenue_state": 300.0,
        "revenue_federal": 0.0, "revenue_total": 400.0})
    assert entry["per_fte"] == {"local": 0.5, "state": 1.5, "federal": 0.0,
                                "total": 2.0}
