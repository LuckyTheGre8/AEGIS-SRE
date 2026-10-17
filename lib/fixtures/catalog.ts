// Browser-safe fixture metadata. Setup programs and patch policy stay server-side.
export const FIXTURE_IDS = ["broken-proxy", "missing-environment", "broken-health-check"] as const;
export type FixtureId = typeof FIXTURE_IDS[number];
export const FIXTURE_CATALOG = [
  { id: "broken-proxy", title: "Broken proxy / 502", incidentText: "Production API is returning HTTP 502 errors. Diagnose the issue.", description: "A proxy fails while its backend remains healthy." },
  { id: "missing-environment", title: "Missing environment variable / 500", incidentText: "Production API requests return HTTP 500, although the service health endpoint is healthy. Diagnose the issue.", description: "A request requires synthetic environment configuration; basic service health still passes." },
  { id: "broken-health-check", title: "Broken health check", incidentText: "The application is healthy, but its configured health probe fails. Diagnose the issue.", description: "A configured monitor fails despite a healthy application and readiness endpoint." },
] as const;

export function fixtureMetadata(id: FixtureId = "broken-proxy") {
  return FIXTURE_CATALOG.find(fixture => fixture.id === id)!;
}
