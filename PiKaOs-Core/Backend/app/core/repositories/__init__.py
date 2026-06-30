"""Data-access layer: all SQL queries live here, one module per aggregate.

Routers and services never write raw queries — they call these functions. This
keeps DB details in one place and makes the rest of the code read like plain English.
"""
