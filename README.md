# console

A web console for the Robot Study Companion (RSC). It runs in the browser and talks to the robot's daemon, [rsc-host](https://github.com/RobotStudyCompanion/host).

## Comparison with Reachy Mini

How the RSC console compares with the Reachy Mini app, from a user's point of view (October 2026).

| Feature | Reachy Mini | RSC console |
|---|---|---|
| Installation and getting started | You install the application. | You open the console in a web browser. |
| Connecting | Finds robots automatically over USB and Wi-Fi. | No reliable search. The Scan button tries a few common hostnames on the local network, but it also lists robots that don't exist, so in practice you type the robot's address and token by hand (one time, after that the console remembers the information). So far, connecting is the hardest and most annoying part of using the robot. |
| Simulation | Built in, one click. | None in the console yet. rsc-host has a fake backend for testing without hardware, but it has no 3D view. |
| Expressions and emotes | Many emotes and movements to trigger, but the menu is not very clear. | A few front-panel expressions to choose from: happy and sad moods, blink, and a mood cycle. |
| Custom apps | Users can download apps or create their own. | None yet. |
| 3D model | Built into the application. | A 3D model of the robot exists, but it isn't in the console yet. |
| Volume control | Device name, and volume sliders for the speaker and microphone. | Preset volume buttons (25, 50, 75, 100%), speaker and mic mute, and a "devices" button that lists the audio devices. No slider. |
| Logs | Timestamped actions, with expand and copy buttons. | A timestamped event log of everything sent and received, with copy, save and clear buttons. |
| Chat with an LLM | Seems to be available, but not tested yet. The LLM can be remote or run locally. | Planned. A chat panel prototype exists, with a mock backend. |
| Settings | Daemon updates, motors on/off, clear caches. | None yet. Whether any are needed is still open. |
| Privacy | An option to share anonymous usage data. The "learn more about privacy" link is broken. | No usage data is collected; commands go straight to the robot over the local network. |
| Mechanical controls | Antennas, head, body and roll, each controlled with a slider over a range of values. | Flippers have preset buttons, a speed slider each, and a calibration slider. Most other controls send fixed values, but any value can be sent from the Custom verb section. |
