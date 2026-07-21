"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { geoContains } from "d3-geo";
import type { CountyFeature } from "@/lib/geo";
import { INK, MUTED, PAPER, RULE, SPRUCE } from "@/lib/theme";

type Status =
  | { state: "idle" }
  | { state: "locating" }
  | { state: "denied" }
  | { state: "unavailable" }
  | { state: "outside" };

const MESSAGES: Record<Exclude<Status["state"], "idle">, string> = {
  locating: "Locating…",
  denied:
    "Location permission was declined — no problem, pick your county below.",
  unavailable:
    "Your location isn't available right now — pick your county below.",
  outside:
    "That location looks like it's outside Georgia — pick a county below.",
};

export function GeolocateCounty({
  features,
  slugByFips,
}: {
  features: CountyFeature[];
  slugByFips: Record<string, string>;
}) {
  const router = useRouter();
  // navigator only exists client-side; the static HTML renders no button.
  const supported = useSyncExternalStore(
    () => () => {},
    () => "geolocation" in navigator,
    () => false,
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });

  function locate() {
    setStatus({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const county = features.find((feature) =>
          geoContains(
            { type: "Feature", geometry: feature.geometry, properties: {} },
            point,
          ),
        );
        const slug = county ? slugByFips[county.fips] : undefined;
        if (slug) {
          router.push(`/receipt/${slug}/`);
        } else {
          setStatus({ state: "outside" });
        }
      },
      (error) => {
        setStatus({
          state:
            error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        });
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div>
      {supported ? (
        <button
          type="button"
          onClick={locate}
          disabled={status.state === "locating"}
          className="border px-3 py-1.5 font-mono text-xs uppercase tracking-widest"
          style={{
            borderColor: SPRUCE,
            color: status.state === "locating" ? MUTED : SPRUCE,
            backgroundColor: PAPER,
          }}
        >
          {status.state === "locating"
            ? "Locating…"
            : "Use my location"}
        </button>
      ) : null}
      <p
        aria-live="polite"
        className="mt-2 text-xs leading-relaxed"
        style={{ color: status.state === "outside" ? INK : MUTED }}
      >
        {status.state !== "idle" && status.state !== "locating"
          ? MESSAGES[status.state]
          : supported
            ? "Your location is matched to a county entirely in your browser — it is never sent anywhere."
            : ""}
      </p>
      <div className="mt-4 border-t" style={{ borderColor: RULE }} />
    </div>
  );
}
