"""Read-only fb-env contract tests; no provisioned lab or DSH is required."""

import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


class Contract:
    CLI = Path(__file__).resolve().with_name("fb-env")
    WORKTREE = CLI.parents[2]
    PRIMARY = Path("/Volumes/SSD1/GitHub/dsh-fishball")
    TIMEOUT_SECONDS = 30
    COMMANDS = (
        "create", "start", "stop", "restart", "reinstall", "wipe",
        "status", "logs", "url", "destroy", "cleanup", "relink", "plan",
    )
    LOOPBACK = "http://127.0.0.1"
    PORTS = {
        "integration": (46100, 46101),
        "dev-1": (46102, 46103),
        "dev-2": (46104, 46105),
    }
    MONOREPO_PACKAGES = {
        "fishball": "dsh-fishball",
        "connector": "dsh-connector/packages/dsh-connector",
        "instance": "dsh-fishball-instance/packages/dsh-instance",
    }


class FbEnvCliTest(unittest.TestCase):
    def run_cli(self, *args):
        # Do not invoke lifecycle commands: the CLI uses a fixed, real lab root.
        return subprocess.run(
            [Contract.CLI, *args],
            cwd=Contract.WORKTREE,
            capture_output=True,
            text=True,
            timeout=Contract.TIMEOUT_SECONDS,
        )

    def output(self, *args):
        result = self.run_cli(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def assert_rejected(self, *args):
        result = self.run_cli(*args)
        self.assertGreater(result.returncode, 0, result)
        self.assertNotIn("Traceback (most recent call last):", result.stderr)

    def test_help_lists_supported_commands(self):
        help_text = self.output("--help")
        for command in Contract.COMMANDS:
            with self.subTest(command=command):
                self.assertRegex(help_text, rf"\b{re.escape(command)}\b")

    def test_each_slot_has_its_fixed_loopback_pair(self):
        for slot, ports in Contract.PORTS.items():
            with self.subTest(slot=slot):
                self.assertCountEqual(
                    self.output("url", slot).strip().splitlines(),
                    [f"{Contract.LOOPBACK}:{port}" for port in ports],
                )

    def test_url_requires_a_fixed_slot_and_accepts_no_overrides(self):
        for args in (
            (),
            ("dev-0",),
            ("dev-3",),
            ("dev-01",),
            (f"{Contract.LOOPBACK}:{Contract.PORTS['integration'][0]}",),
            (Contract.PRIMARY,),
            ("../integration",),
            ("dev-1", "dev-2"),
            ("dev-1", "--target", Contract.LOOPBACK),
        ):
            with self.subTest(args=args):
                self.assert_rejected("url", *args)

    def test_plan_reports_packages_and_git_head_for_each_checkout_kind(self):
        for checkout in dict.fromkeys((Contract.PRIMARY, Contract.WORKTREE)):
            with self.subTest(checkout=checkout):
                head = subprocess.check_output(
                    ["git", "--no-optional-locks", "-C", checkout, "rev-parse", "HEAD"],
                    text=True,
                    timeout=Contract.TIMEOUT_SECONDS,
                ).strip()
                plan = json.loads(self.output("plan", checkout))
                self.assertIsInstance(plan, dict)
                self.assertEqual(plan["layout"], "monorepo")
                self.assertEqual(plan["source"], str(checkout))
                self.assertEqual(plan["head"], head)
                self.assertIsInstance(plan["amenities"], dict)
                for component, suffix in Contract.MONOREPO_PACKAGES.items():
                    self.assertEqual(plan[component], str(checkout / suffix), component)

    def test_plan_requires_one_absolute_checkout_root(self):
        with tempfile.TemporaryDirectory() as directory:
            non_checkout = Path(directory).resolve()
            for args in (
                (),
                (".",),
                (Contract.WORKTREE / Contract.MONOREPO_PACKAGES["fishball"],),
                (non_checkout,),
                (non_checkout / "missing",),
                (Contract.WORKTREE, Contract.PRIMARY),
            ):
                with self.subTest(args=args):
                    self.assert_rejected("plan", *args)

    def test_plan_rejects_same_layout_from_a_different_git_repository(self):
        # A clone retains the package layout and commit, but not the registered
        # checkout identity. It uses only local objects and writes to temp storage.
        with tempfile.TemporaryDirectory() as directory:
            foreign = Path(directory).resolve() / "foreign-clone"
            subprocess.run(
                [
                    "git", "-c", f"core.hooksPath={os.devnull}",
                    "clone", "--quiet", "--shared", "--single-branch", "--no-tags",
                    Contract.WORKTREE, foreign,
                ],
                # Do not run personal filters or hooks while checking out the fixture.
                env={**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"},
                check=True,
                capture_output=True,
                text=True,
                timeout=Contract.TIMEOUT_SECONDS,
            )
            self.assert_rejected("plan", foreign)


if __name__ == "__main__":
    unittest.main()
