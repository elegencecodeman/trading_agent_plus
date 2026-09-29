"""TradingAgents HTTP bridge — wraps ``TradingAgentsGraph.propagate`` behind a
FastAPI endpoint and streams its LangGraph execution as SSE events that map
1:1 onto the ``control-center`` frontend's data types.

This is a *thin* adapter: it does not reimplement the agent pipeline, it only
surfaces the same node execution the CLI already runs.
"""
