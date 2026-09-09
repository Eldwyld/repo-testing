from __future__ import annotations

from hollow.gate import mutation, paths
from hollow.gate.redgreen import evaluate
from tests.conftest import GOOD, GOOD_TEST, GOOD_TOOL


def _checks(result):
    return {c.name: c.ok for c in result.checks}


def test_good_change_is_accepted(repo):
    sha = repo.branch("agent/scout/slugify-1", GOOD)
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert result.ok, result.summary()
    names = [c.name for c in result.checks]
    assert names[-4:] == ["green-after", "suite-green", "red-reverted", "mutation"]


def test_worthless_test_is_rejected_by_mutation(repo):
    weak = "from workspace.tools import slugify\n\n\ndef test_exists():\n    assert slugify.slugify is not None\n"
    sha = repo.branch("agent/scout/slugify-1", {"workspace/tools/slugify.py": GOOD_TOOL,
                                                "workspace/tests/test_slugify.py": weak})
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok
    assert _checks(result)["mutation"] is False


def test_change_without_test_is_rejected(repo):
    sha = repo.branch("agent/scout/slugify-1", {"workspace/tools/slugify.py": GOOD_TOOL})
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok and _checks(result)["shape"] is False


def test_test_that_already_passes_is_rejected(repo):
    repo.write(GOOD)
    repo.commit("existing tool")
    # "fix" that changes nothing observable: the same test, a cosmetic edit
    sha = repo.branch("agent/scout/slugify-2", {
        "workspace/tools/slugify.py": GOOD_TOOL + "\n# tidy\n",
        "workspace/tests/test_slugify.py": GOOD_TEST + "\n# tidy\n",
    })
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok and _checks(result)["red-before"] is False


def test_fix_of_existing_tool_needs_a_new_failing_test(repo):
    repo.write(GOOD)
    repo.commit("existing tool")
    fixed = GOOD_TOOL.replace('return text or "n-a"', 'return text[:20] or "n-a"')
    new_test = GOOD_TEST + "\n\ndef test_truncates():\n    assert len(slugify('a' * 50)) == 20\n"
    sha = repo.branch("agent/analyst/slugify-3", {"workspace/tools/slugify.py": fixed,
                                                  "workspace/tests/test_slugify.py": new_test})
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert result.ok, result.summary()


def test_regression_in_suite_is_rejected(repo):
    repo.write(GOOD)
    repo.commit("existing tool")
    other = {"workspace/tools/upper.py": "from workspace.tools.slugify import slugify\n\n\ndef up(s):\n    return slugify(s).upper()\n",
             "workspace/tests/test_upper.py": "from workspace.tools.upper import up\n\n\ndef test_up():\n    assert up('a b') == 'A-B'\n"}
    repo.write(other)
    repo.commit("second tool")
    # a "fix" to slugify that breaks upper's expectations
    broken = GOOD_TOOL.replace('.strip("-")', '.strip("-") + "x"')
    new_test = GOOD_TEST.replace('== "hello-world"', '== "hello-worldx"').replace('== "n-a"', '== "x"')
    sha = repo.branch("agent/builder/slugify-4", {"workspace/tools/slugify.py": broken,
                                                  "workspace/tests/test_slugify.py": new_test})
    result = evaluate(repo.path, "main", sha, repo.cfg)
    assert not result.ok and _checks(result)["suite-green"] is False


def test_paths_guard_rejects_everything_outside_workspace(repo):
    protected = repo.cfg["protected_paths"]
    bad = paths.violations([".github/workflows/cycle.yml", "hollow.json", "POLICY.md",
                            "hollow/cycle.py", "workspace/tools/registry.json",
                            "workspace/tools/../../x.py", "README.md", "workspace/notes.md"],
                           protected)
    assert len(bad) == 8
    assert paths.violations(list(GOOD), protected) == []


def test_mutation_strategies():
    src = "def f(x):\n    return x + 1\n\ndef g():\n    return None\n"
    mutated, n, strategy = mutation.mutate(src)
    assert strategy == "return-none" and n == 1 and "return None" in mutated
    src2 = "def f(items):\n    items.append(1)\n"
    mutated2, n2, strategy2 = mutation.mutate(src2)
    assert strategy2 == "empty-bodies" and n2 == 1 and "pass" in mutated2
