from __future__ import annotations

from typing import Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from fawn.agent.state import AgentState
from fawn.agent.tools import TOOLS
from fawn.config import get_settings
from fawn.llm import create_chat_model

_compiled_graph: Any | None = None
_checkpointer_cm: Any | None = None


def _should_continue(state: AgentState) -> str:
    last_message = state["messages"][-1]
    if getattr(last_message, "tool_calls", None):
        return "tools"
    return END


def _build_graph(checkpointer: Any | None = None) -> Any:
    settings = get_settings()
    model = create_chat_model("default")
    tools_enabled = settings.llm.tool_calling_enabled
    if tools_enabled:
        model = model.bind_tools(TOOLS)

    async def agent_node(state: AgentState) -> dict[str, Any]:
        response = await model.ainvoke(state["messages"])
        return {"messages": [response]}

    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.set_entry_point("agent")
    if tools_enabled:
        builder.add_node("tools", ToolNode(TOOLS))
        builder.add_conditional_edges("agent", _should_continue, {"tools": "tools", END: END})
        builder.add_edge("tools", "agent")
    else:
        builder.add_edge("agent", END)
    return builder.compile(checkpointer=checkpointer)


async def get_agent_graph() -> Any:
    global _compiled_graph, _checkpointer_cm
    if _compiled_graph is not None:
        return _compiled_graph

    checkpointer = None
    try:
        _checkpointer_cm = AsyncPostgresSaver.from_conn_string(get_settings().database_url)
        checkpointer = await _checkpointer_cm.__aenter__()
        if hasattr(checkpointer, "setup"):
            await checkpointer.setup()
    except Exception:
        checkpointer = None
        _checkpointer_cm = None

    _compiled_graph = _build_graph(checkpointer)
    return _compiled_graph
