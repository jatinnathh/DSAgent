"""
DSAgent core agent — orchestrates LLM calls and tool execution.
Uses ReAct (Reasoning + Acting) pattern via the Next.js /api/llm/run proxy.
"""

import httpx
import json
from typing import Dict, Any, List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.schema import AgentMessage, AgentResponse, ToolCall, ToolResult
from tools.registry import tool_registry
from core.metadata import metadata_to_llm_prompt
import asyncio


class DSAgent:
    """
    Main DSAgent — orchestrates LLM calls and tool execution.
    Calls Next.js /api/llm/run which proxies to Anthropic.
    """

    def __init__(self, llm_endpoint: str = None):
        self.llm_endpoint = llm_endpoint or os.getenv("LLM_ENDPOINT", "http://localhost:3000/api/llm/run")

    async def _call_llm(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"messages": messages}
        if tools:
            payload["tools"] = tools

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(self.llm_endpoint, json=payload)
                if response.status_code != 200:
                    raise Exception(
                        f"LLM API error ({response.status_code}): {response.text[:500]}"
                    )
                return response.json()
        except httpx.ConnectError:
            raise Exception(f"Could not connect to LLM endpoint at {self.llm_endpoint}. Is the Next.js server running?")
        except Exception as e:
            raise Exception(f"Failed to call LLM: {str(e)}")

    def _get_system_prompt(self, metadata_prompt: str) -> str:
        available_tools = tool_registry.list_tools()
        return f"""You are DSAgent, an expert data scientist AI assistant. \
Your job is to analyze datasets by CALLING the available tools — \
not by describing what you would do, but by actually calling them.

## Dataset Information:
{metadata_prompt}

## Available Tools:
{', '.join(available_tools)}

## Workflow:
1. Start with data_quality_report and detect_missing_values.
2. Then call dataset_overview and correlation_analysis.
3. Create visualizations (create_histogram, create_scatter_plot, etc.).
4. If prediction is needed, call auto_ml_pipeline.
5. Summarize findings in plain business language.

Always explain your reasoning. Be concise and actionable."""

    async def analyze_dataset(
        self,
        session_id: str,
        metadata_prompt: str,
        user_question: Optional[str] = None,
        max_iterations: int = 10,
    ) -> AgentResponse:
        """
        Main ReAct loop — analyzes dataset and answers questions.
        """
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self._get_system_prompt(metadata_prompt)},
            {
                "role": "user",
                "content": (
                    f"Please analyze this dataset and answer: {user_question}"
                    if user_question
                    else "Please analyze this dataset and provide comprehensive insights."
                ),
            },
        ]

        conversation_history: List[AgentMessage] = []
        iteration = 0

        while iteration < max_iterations:
            iteration += 1

            try:
                tools = tool_registry.get_tool_definitions()
                llm_response = await self._call_llm(messages, tools)

                # ── Parse the OpenAI-compatible wrapper from our route ──────
                output = llm_response.get("output", {})

                if isinstance(output, dict) and "choices" in output:
                    choice = output["choices"][0]["message"]
                    content = choice.get("content") or ""
                    raw_tool_calls = choice.get("tool_calls") or []
                elif isinstance(output, dict) and ("content" in output or "tool_calls" in output):
                    # Handle case where output is just the message object
                    content = output.get("content") or ""
                    raw_tool_calls = output.get("tool_calls") or []
                elif isinstance(output, str):
                    content = output
                    raw_tool_calls = []
                else:
                    # Log unexpected format
                    print(f"⚠️ Unexpected LLM output format: {type(output)} - {output}")
                    content = str(output)
                    raw_tool_calls = []

                # ── Build assistant message ────────────────────────────────
                assistant_msg: Dict[str, Any] = {
                    "role": "assistant",
                    "content": content,
                }
                if raw_tool_calls:
                    assistant_msg["tool_calls"] = raw_tool_calls

                messages.append(assistant_msg)
                conversation_history.append(
                    AgentMessage(
                        role="assistant",
                        content=content,
                        tool_calls=[
                            ToolCall(
                                tool_name=tc.get("function", {}).get("name", ""),
                                arguments=json.loads(
                                    tc.get("function", {}).get("arguments", "{}")
                                ),
                            )
                            for tc in raw_tool_calls
                        ]
                        or None,
                    )
                )

                # ── If no tool calls — agent is done ──────────────────────
                if not raw_tool_calls:
                    return AgentResponse(
                        session_id=session_id,
                        iteration=iteration,
                        thought=content,
                        action=None,
                        observation=None,
                        final_answer=content,
                        is_complete=True,
                        conversation_history=conversation_history,
                    )

                # ── Execute each tool call ────────────────────────────────
                for tc in raw_tool_calls:
                    fn_name = tc.get("function", {}).get("name", "")
                    fn_args_raw = tc.get("function", {}).get("arguments", "{}")
                    fn_args = (
                        json.loads(fn_args_raw)
                        if isinstance(fn_args_raw, str)
                        else fn_args_raw
                    )

                    # Inject session_id if missing
                    if "session_id" not in fn_args:
                        fn_args["session_id"] = session_id

                    tool_result = tool_registry.execute(fn_name, fn_args)

                    # Serialize output — strip large base64 images to save tokens
                    result_output = tool_result.output or {}
                    if isinstance(result_output, dict) and "image_base64" in result_output:
                        result_output = {
                            **result_output,
                            "image_base64": "[image generated — omitted from context]",
                        }

                    tool_msg: Dict[str, Any] = {
                        "role": "tool",
                        "tool_call_id": tc.get("id", f"call_{iteration}_{fn_name}"),
                        "content": json.dumps(
                            {
                                "success": tool_result.success,
                                "output": result_output,
                                "error": tool_result.error,
                                "execution_time_ms": tool_result.execution_time_ms,
                            }
                        ),
                    }
                    messages.append(tool_msg)

            except Exception as exc:
                err = f"Error in iteration {iteration}: {exc}"
                return AgentResponse(
                    session_id=session_id,
                    iteration=iteration,
                    thought=err,
                    action=None,
                    observation=None,
                    final_answer=f"I encountered an error during analysis: {err}",
                    is_complete=True,
                    conversation_history=conversation_history,
                )

        # Max iterations reached
        return AgentResponse(
            session_id=session_id,
            iteration=max_iterations,
            thought="Reached maximum iterations",
            action=None,
            observation=None,
            final_answer="I've reached the analysis limit. Here's what I found so far based on the tools I ran.",
            is_complete=True,
            conversation_history=conversation_history,
        )


# Global agent instance
agent = DSAgent()