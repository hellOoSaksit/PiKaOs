"""PiKaOs Core — base infrastructure + the agent-runtime platform (engine).

Every feature is a removable plugin under ``app/plugins/`` that talks to Core only through
contracts / the DI container / the Event Bus (plugin-architecture.md). Core imports zero plugin code.
"""
