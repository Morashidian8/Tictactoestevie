"""Agents 3, 4, 5 — the parallel hunters. Same mechanics, different lenses."""
from __future__ import annotations

from dataclasses import dataclass

from ..llm import StructuredLLM
from ..state import AuditState, FindingsOutput
from .base import SCOPE_GUARD, code_block, render_context, render_invariants


@dataclass(frozen=True)
class Hunter:
    role: str
    prefix: str
    focus: str

    @property
    def system(self) -> str:
        return SCOPE_GUARD + f"""

Role: {self.focus}
Prioritise functions with high risk scores in the context map. For each issue
give a concrete exploit scenario (preconditions, transaction sequence, attacker
profit or victim loss) and the invariant ids it violates.
Use ids {self.prefix}-01, {self.prefix}-02, ... Severity follows Code4rena:
critical/high = direct loss of funds or permanent freeze; medium = conditional
loss or broken core function; low/informational = everything else."""

    def run(self, llm: StructuredLLM, state: AuditState) -> dict:
        user = (
            f"<context_map>\n{render_context(state.get('context_map'))}\n</context_map>\n\n"
            f"<invariants>\n{render_invariants(state.get('invariants'))}\n</invariants>\n\n{code_block(state)}"
        )
        out = llm.structured(role=self.role, system=self.system, user=user, schema=FindingsOutput)
        for n, f in enumerate(out.findings, 1):
            f.id = f"{self.prefix}-{n:02d}"  # model-chosen ids may collide across hunters
            f.source_agent = self.role
        return {"raw_findings": out.findings}


AGENT3_DEFI = Hunter(
    role="agent3_defi",
    prefix="A3",
    focus="""Tokenomics & DeFi Logic Auditor. Hunt economic flaws: oracle and spot-price
manipulation (flash loans, TWAP windows, stale/zero prices), share-inflation and
first-depositor attacks, reward-per-token accounting drift, liquidation and
health-factor logic, MEV/sandwich exposure, incentive misalignment, griefing that
costs the attacker less than the victim.""",
)

AGENT4_MATH = Hunter(
    role="agent4_math",
    prefix="A4",
    focus="""Bit-Level Math & Bytecode Formalist. Hunt precision loss (division before
multiplication), rounding direction that favours the user instead of the protocol,
unsafe downcasts (uint256->uint128 etc.), overflow inside `unchecked` blocks,
signed/unsigned confusion, decimals mismatch between tokens, fixed-point scaling
errors, and compiler/version quirks (pragma, abi.encodePacked collisions,
via-IR differences, transient storage, assembly memory safety).""",
)

AGENT5_EDGE = Hunter(
    role="agent5_edge",
    prefix="A5",
    focus="""Edge-Case & Integration Specialist. Hunt non-standard ERC20 behaviour
(fee-on-transfer, rebasing, missing return values like USDT, approve race,
blocklists, ERC777 hooks), reentrancy via callbacks (ERC721/1155 receivers,
native ETH), unbounded loops and DoS, L2 differences (block.number, sequencer
downtime, PUSH0), signature replay / missing nonces / chainId, proxy storage
collisions, uninitialised implementations and initializer front-running.""",
)

HUNTERS = (AGENT3_DEFI, AGENT4_MATH, AGENT5_EDGE)
