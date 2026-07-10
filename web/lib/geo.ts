import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countiesAtlas from "us-atlas/counties-10m.json";

export interface CountyFeature {
  fips: string;
  name: string;
  geometry: Geometry;
}

const GEORGIA_PREFIX = "13";

export function georgiaCountyFeatures(): CountyFeature[] {
  const topology = countiesAtlas as unknown as Topology<{
    counties: GeometryCollection<{ name: string }>;
  }>;
  const collection = feature(topology, topology.objects.counties);
  return collection.features
    .filter(
      (f): f is Feature<Geometry, { name: string }> & { id: string } =>
        typeof f.id === "string" &&
        f.id.startsWith(GEORGIA_PREFIX) &&
        f.id.length === 5 &&
        f.geometry != null,
    )
    .map((f) => ({ fips: f.id, name: f.properties.name, geometry: f.geometry }))
    .sort((a, b) => a.fips.localeCompare(b.fips));
}
