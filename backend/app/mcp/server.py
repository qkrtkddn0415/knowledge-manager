"""Local STDIO MCP server exposing the canonical Second Brain read tools.

The MCP layer deliberately contains no knowledge logic. It opens a short-lived
SQLite session and delegates directly to the existing Agent tool functions.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Make absolute execution from Codex independent of the caller's cwd. The
# application uses relative DATABASE_URL/DATA_DIR values in backend/.env.
BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
import os

os.chdir(BACKEND_DIR)

from mcp.server import MCPServer
from mcp.types import ToolAnnotations
from sqlmodel import Session

from app.agent.tools.explore_node import execute as execute_explore_node
from app.agent.tools.search_knowledge import execute as execute_search_knowledge
from app.db import engine


mcp = MCPServer(
    name="second-brain",
    version="1.0.0",
    description="Read-only access to the local Second Brain knowledge graph and evidence search.",
    instructions=(
        "Use search_knowledge for topic or sentence retrieval. "
        "Use explore_node for precise graph traversal after identifying node IDs. "
        "Both tools are read-only and return source-backed results."
    ),
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)


@mcp.tool(
    name="search_knowledge",
    description="Search the private Second Brain for up to three evidence chunks, source documents, and connected concepts.",
    annotations=READ_ONLY,
    structured_output=True,
)
def search_knowledge(
    query: str,
    document_ids: list[str] | None = None,
    result_limit: int = 3,
) -> dict[str, Any]:
    """Delegate to the existing search_knowledge Agent tool."""
    arguments = {
        "query": query,
        "document_ids": document_ids or [],
        "result_limit": result_limit,
    }
    with Session(engine) as session:
        return execute_search_knowledge(session, arguments)


@mcp.tool(
    name="explore_node",
    description="Explore graph nodes, their relations, connected source chunks, and non-overlapping evidence passages.",
    annotations=READ_ONLY,
    structured_output=True,
)
def explore_node(
    node_ids: list[str],
    max_excerpts_per_node: int = 8,
    context_chars: int = 500,
) -> dict[str, Any]:
    """Delegate to the existing explore_node Agent tool."""
    arguments = {
        "node_ids": node_ids,
        "max_excerpts_per_node": max_excerpts_per_node,
        "context_chars": context_chars,
    }
    with Session(engine) as session:
        return execute_explore_node(session, arguments)


def main() -> None:
    """Run the MCP server over stdin/stdout for a local MCP host."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
