# PropertyLens ASI:One coordinator

One Fetch.ai uAgent connects ASI:One conversations to the existing PropertyLens
backend. It implements Agent Chat Protocol 0.3.0, acknowledges messages,
publishes its protocol manifest, and keeps conversation history for follow-ups.

## Implemented build order

1. ACP entry point, persistent ASI:One tool loop, mailbox registration settings.
2. Real IKEA Actor search using the tested `size-fields` build and inch dimensions.
3. Load existing houses, search/convert floor plans with the existing Actor and
   CubiCasa tools, place and move sized primitives with collision checks.
4. SAM 3D / resize.py: **not implemented**. The tool returns unavailable, never a
   fabricated model. Materials and textures are also not connected.

Having this source code is not proof of Agentverse registration or ASI:One
discoverability. Complete and verify the account steps below before submission.
An ASI:One Pro subscription is not a credential supplied to this program; obtain
a developer API key and verify its API entitlement separately.

## Local setup

Requires Node.js 22+ and Python 3.10+. From the repository root:

```sh
npm ci
node server/scripts/setup-agent.js
python -m venv server/data/agent-venv
```

Activate the environment: Windows PowerShell
`server/data/agent-venv/Scripts/Activate.ps1`; macOS/Linux
`source server/data/agent-venv/bin/activate`.

```sh
python -m pip install -r agents/propertylens/requirements.txt
```

In the ignored `server/.env` file, set:

```text
ASI1_API_KEY=<developer key created in your ASI:One account>
ASI1_MODEL=asi1
AGENT_BACKEND_URL=http://127.0.0.1:3001
AGENT_PORT=8001
ENABLE_APIFY=true
IKEA_LIVE_SEARCH=true
```

`AGENT_BACKEND_URL` must match the actual API port, including process-level PORT
overrides (the current desktop preview uses 3102). The setup script creates
random AGENT_SEED and AGENT_BRIDGE_TOKEN values; keep both private and preserve
the seed so the agent keeps the same identity. An existing APIFY_TOKEN is needed
for live IKEA searches. Leave all credentials out of Git and chat transcripts.
For real floor-plan searches set USE_FIXTURES=false. When it is true, house jobs
are explicitly returned as fixtures. The synthetic demo is always identified.

Start the backend and frontend using the usual project commands, then start:

```sh
python agents/propertylens/agent.py
```

No registration is attempted if the developer key is absent. The Python service
uses an authenticated backend bridge; only backend config selects its URL.
Remote backend connections must use HTTPS. ASI tokens stay in the Python service
and are never sent to the browser or model as tool arguments.

## Register on Agentverse and test in ASI:One

If the browser inspector cannot reach localhost, use the registration helper:
put an Agentverse API key in `server/.env` as `AGENTVERSE_KEY`, then run
`python agents/propertylens/register.py`. This registers the same seeded identity
as a mailbox agent without exposing the local backend to the public Internet.
Keep `agent.py` running. The Agentverse key is separate from the ASI:One key.

1. Create/sign in to your Agentverse account.
2. Start the agent, open the Inspector URL printed by uAgents, and connect its
   mailbox to your Agentverse account. Keep the process online during judging.
3. Set the agent profile name to **PropertyLens Home and IKEA Planner** and choose
   an available handle. Suggested description: “Search IKEA furniture with real
   dimensions, load saved house geometry, place sized placeholders, check wall,
   door and furniture collisions, and edit saved layouts conversationally.
   Textured SAM 3D models are not connected yet.”
4. Confirm AgentChatProtocol 0.3.0 is published on its profile; choose **Chat with
   Agent** to open ASI:One. Verify discovery by its actual handle as well.
5. In your website planner choose **Connect ASI:One**. Tell the agent the one-time
   code. This is a setup step linking your own workspace; do not share the code
   with other people. It expires after 10 minutes and can be used only once.
6. Ask it to list your saved houses and load one, or explicitly choose the
   synthetic demo. No browser client ID needs to be disclosed in conversation.

Official references:
- https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi-compatible-uagents
- https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol
- https://docs.asi1.ai/documentation/build-with-asi-one/tool-calling

## Conversation demo (all primary actions in ASI:One)

1. “Connect my workspace with code …”
2. “List my houses and load [house ID].”
3. “Find a small grey two-seat IKEA sofa for the living room.”
4. Agent calls the real Actor and reports product, image link and dimensions.
5. “Yes, use that product and place a sized placeholder in [room].”
6. Agent checks the house, saves a valid placement, reads it back, and reports
   the saved result. If the room is too small or the product lacks dimensions,
   it must explain the failure instead of reporting success.
7. “Move [placement ID] to x 100, z 120 inches and rotate it 90 degrees.”
8. Agent validates and saves the edit; get_scene verifies the persisted result.

The website is an optional visual viewer. Refresh it after conversational edits;
it currently does not subscribe to external changes in real time. No primary
search/confirmation/placement action requires switching to the website. ACP text
and image URLs are supported; an embedded interactive 3D card is not implemented.

Tool and conversation history are stored in ignored `server/data/` files. Tool
request IDs are cached to avoid repeating completed side effects. Do not retry
timed-out paid operations blindly; query status first. Existing Apify caps apply.

## Tests without API keys or external calls

```sh
node --test server/tests/agent-coordinator.test.js
python -m unittest discover -s agents/propertylens -p "test_*.py" -v
```

The tests use fake model/search responses and isolated storage; they verify the
tool loop, confirmation context, persistent history, duplicate calls, session
isolation, workspace authentication, expiry, room placement and collisions.
They do not prove a successful live ASI:One conversation. Record that separately.

## SAM 3D integration contract for the next stage

Provide a server-side image-to-mesh service that accepts the verified product
image URL and widthIn/depthIn/heightIn, returns a job ID, and exposes job status.
Its pipeline must generate -> resize to real dimensions -> validate bounds and
orientation -> store GLB. Return model URL and explicit model units; keep exact
collision dimensions independent of the mesh. Then implement the existing
generate_furniture_model tool and a model loader. Do not remove the placeholder
path when adding generated models.
