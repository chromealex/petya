# Broader adaptation feasibility

The v18 development diagnosis does not establish restarting from the unadapted base as a cure. This initial v19 step probes the feasibility of expanding the existing rank-8 LoRA from thirteen to all thirty-two blocks using four longest existing training dialogues. It tests finite gradients and memory use only. Parent weights must match on load and newly introduced B matrices must be zero, as checked by the unchanged v7 trainer.

Probe weights are not a candidate. No quality gain or causal claim follows from a successful gradient probe. A full training experiment must start again from the selected v18 parent with independently frozen data and complete retention checks. Production prompts, sampling, services and MCP remain unchanged.
