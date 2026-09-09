"""Hollow v2 — agents that pick their own goals, gated by red-green CI.

Git is the substrate: every agent action is a branch, a commit and a pull
request. Nothing an agent writes reaches ``main`` except through a merge
that the gate (see :mod:`hollow.gate`) has approved.
"""

__version__ = "2.0.0"
