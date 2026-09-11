CONCEPT_TYPES = {
    "organization", "organization_unit", "person", "country", "region", "place",
    "technology", "equipment", "system", "project_program", "policy_law", "event", "document",
}
DOCUMENT_STATUSES = {"draft", "analyzing", "review_ready", "storing", "ready", "failed", "deleted"}
JOB_STATUSES = {"queued", "running", "review_ready", "deleting", "succeeded", "failed", "cancelled"}
JOB_STEPS = {"validating", "storing_source", "chunking", "uploading", "indexing", "waiting_index", "extracting", "graphing", "storing", "ready"}
SUPPORTED_FORMATS = {"txt", "md", "pdf"}
MAX_PAGE_SIZE = 100
