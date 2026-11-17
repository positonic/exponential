/** The same protected-resource metadata, at the location RFC 9728 §3.1 derives for `/api/mcp`. */

export { GET, OPTIONS } from "../../route";

// Segment config is read from this file, not followed through the re-export.
export const dynamic = "force-dynamic";
