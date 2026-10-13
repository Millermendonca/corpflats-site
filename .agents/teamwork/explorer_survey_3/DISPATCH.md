# Task Assignment: Explorer Survey 3 (IoT Hardware Architecture & Welcome Audio Specs)

## Mission
Investigate specifications and technical designs for R4 and R5:
1. Welcome Playlist (R4):
   - Mechanism for audio playlist simulation and playback in web UI (ambient hospitality tracks, HTML5 Audio, controls for play, pause, next/previous, volume).
   - Rules for check-in day trigger: official check-in time (e.g. 14:00) automatic activation for rooms with check-in today.
   - Alexa/Echo Dot integration concept and how it bridges to the web preview.
2. IoT Hardware Architecture & Acquisition Guide (R5):
   - Research and specify exact hardware requirements for CorpFlats:
     * Smart Plugs: Tuya/Smart Life Wi-Fi 16A with thermal overload protection and energy monitoring (specifically sized for 1000W-1500W coffee machines, 10A vs 16A standard NBR 14136 pins).
     * Smart IR Blasters: Tuya/Broadlink Wi-Fi IR transmitters for split AC control (carrier frequency 38kHz, positioning, line-of-sight, temperature sensor integration).
     * Smart Speakers: Amazon Echo Pop / Echo Dot (Alexa) integration, multi-room, Spotify/Amazon Music hospitality routines.
     * Smart Switches: Wi-Fi touch wall switches (with neutral or capacitor, 1/2/3 gangs) for lighting control.
   - Security, networking (2.4GHz dedicated IoT VLAN, local Tuya vs cloud), and operational failure modes.
3. Determine where the IoT Hardware Guide documentation should be located (e.g. `docs/SMART_FLAT_HARDWARE_GUIDE.md` or similar).

Read:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically ## Follow-up — 2026-10-11T23:35:41Z)
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`

Output: Write your detailed report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\handoff.md`.


## 2026-10-11T23:38:45Z
[Message] timestamp=2026-10-11T23:38:45Z sender=26335f75-5ae5-4381-97dc-4cdaaa103cfd priority=MESSAGE_PRIORITY_HIGH content=You are Explorer Survey 3 (IoT Hardware Architecture & Welcome Audio Specs) for Smart Flat Hub.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3
Read your instructions in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\DISPATCH.md
Read the user request in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Also read AGENTS.md in the project root.
DO NOT modify or write any source code. You are read-only.
Investigate welcome playlist audio implementation, check-in day trigger rules, fail-safe safety lifecycle, and hardware specifications (Tuya 16A smart plugs, IR blasters, Echo Pop/Dot Alexa, touch switches) for the acquisition guide.
Write your full findings and handoff report to: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_survey_3\handoff.md
Update progress.md in your directory as you work.
When finished, send a brief completion message back to the orchestrator.
