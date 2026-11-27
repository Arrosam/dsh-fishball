"""Read-only fb-env contract tests; no provisioned lab or DSH is required."""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
from io import StringIO
from pathlib import Path
from unittest.mock import patch


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


class FbEnvOpenTest(unittest.TestCase):
    SLOT = "dev-2"
    RECORD_PID = 4321
    ADMISSION_MARKER = "synthetic-admission-marker"
    MANUAL_FLAG = "--manual"

    def setUp(self):
        loader = SourceFileLoader("fb_env_open_test", str(Contract.CLI))
        spec = spec_from_loader(loader.name, loader)
        self.cli = module_from_spec(spec)
        loader.exec_module(self.cli)

        root = Path(self.enterContext(tempfile.TemporaryDirectory())).resolve()
        control = root / "control"
        control.mkdir()
        self.slot = root / "envs" / self.SLOT
        self.slot.mkdir(mode=0o700, parents=True)
        state = {"token": "test-slot", "generation": 1, "source": str(Contract.WORKTREE), "head": "test-head"}
        (control / f"{self.SLOT}.json").write_text(json.dumps(state))
        (self.slot / ".slot").write_text(state["token"])
        self.private_url = f"{Contract.LOOPBACK}:{Contract.PORTS[self.SLOT][0]}/admit?token={self.ADMISSION_MARKER}"

        # Run the real command against a private fixture; never inspect the installed lab or start Chrome.
        self.enterContext(patch.multiple(self.cli, ROOT=root, CONTROL=control))
        self.lab_ready = self.enterContext(patch.object(self.cli, "lab_ready"))
        self.owned = self.enterContext(patch.object(self.cli.rt, "owned", return_value=False))
        self.admission = self.enterContext(patch.object(self.cli.rt, "private_url", return_value=self.private_url))
        self.spawn = self.enterContext(patch.object(subprocess, "Popen"))

    def run_open(self, slot, *options):
        stdout, stderr = StringIO(), StringIO()
        with (patch.object(sys, "argv", [str(Contract.CLI), "open", slot, *options]),
              patch.object(os, "umask"), redirect_stdout(stdout), redirect_stderr(stderr)):
            try:
                status = self.cli.main()
            except SystemExit as exc:
                status = exc.code
        return status, stdout.getvalue() + stderr.getvalue()

    def record_parent(self):
        record = {"pid": self.RECORD_PID, "anchor": str(self.slot / "parent.patch.yml")}
        (self.slot / "process.json").write_text(json.dumps(record))

    def test_bare_open_directs_agents_to_browserskill_before_lab_access(self):
        with patch.object(self.cli, "Slot") as slot_type, patch.object(self.cli, "lock") as slot_lock:
            for slot in Contract.PORTS:
                with self.subTest(slot=slot):
                    status, output = self.run_open(slot)
                    self.assertGreater(status, 0, output)
                    self.lab_ready.assert_not_called()
                    slot_lock.assert_not_called()
                    slot_type.assert_not_called()
                    self.admission.assert_not_called()
                    self.spawn.assert_not_called()
                    self.assertRegex(output, r"(?i)\bbrowser[ -]?skill\b")
                    self.assertIn("agent", output.lower())

    def test_open_does_not_accept_an_abbreviated_manual_flag(self):
        status, output = self.run_open(self.SLOT, self.MANUAL_FLAG[:-1])
        self.assertGreater(status, 0, output)
        self.lab_ready.assert_not_called()
        self.spawn.assert_not_called()

    def test_manual_open_does_not_launch_without_a_running_owned_parent(self):
        for recorded in (False, True):
            with self.subTest(recorded=recorded):
                if recorded:
                    self.record_parent()  # A stale process record does not make a slot running.
                status, output = self.run_open(self.SLOT, self.MANUAL_FLAG)
                self.assertGreater(status, 0, output)
                self.assertIn("stopped", output.lower())
                self.admission.assert_not_called()
                self.spawn.assert_not_called()

    def test_manual_open_launches_isolated_chrome_without_printing_admission(self):
        self.record_parent()
        self.owned.return_value = True

        status, output = self.run_open(self.SLOT, self.MANUAL_FLAG)

        self.assertEqual(status, 0, output)
        self.admission.assert_called_once_with(self.slot, Contract.PORTS[self.SLOT], self.RECORD_PID)
        self.spawn.assert_called_once()
        (argv,), options = self.spawn.call_args
        self.assertEqual(Path(argv[0]).name, "Google Chrome")
        self.assertIn("--use-mock-keychain", argv)
        self.assertEqual(
            [arg for arg in argv if arg.startswith("--user-data-dir")],
            [f"--user-data-dir={self.slot / 'browser'}"],
        )
        self.assertEqual(options["env"]["HOME"], str(self.slot / "os-home"))
        for stream in ("stdout", "stderr"):
            self.assertEqual(options[stream], subprocess.DEVNULL)
        self.assertIn(self.private_url, argv)
        self.assertNotIn(self.ADMISSION_MARKER, output)


if __name__ == "__main__":
    unittest.main()
