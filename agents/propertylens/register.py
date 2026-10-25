"""Register the existing local ACP identity as a mailbox agent in Agentverse."""
import os
from pathlib import Path
from dotenv import load_dotenv
from uagents_core.config import AgentverseConfig
from uagents_core.contrib.protocols.chat import chat_protocol_spec
from uagents_core.protocol import ProtocolSpecification
from uagents_core.utils.registration import (
    AgentverseRegistrationRequest, RegistrationRequestCredentials, register_agent,
)

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / 'server' / '.env')


def register():
    key, seed = os.getenv('AGENTVERSE_KEY', ''), os.getenv('AGENT_SEED', '')
    if not key or len(seed) < 32:
        raise RuntimeError('Set AGENTVERSE_KEY and AGENT_SEED in ignored server/.env first.')
    config = AgentverseConfig()
    request = AgentverseRegistrationRequest(
        name='PropertyLens Home Planner', type='mailbox',
        endpoint=config.mailbox_endpoint,
        protocols=[ProtocolSpecification.compute_digest(chat_protocol_spec.manifest())],
        active=True,
        description='Find IKEA furniture with real dimensions, load saved houses, place sized placeholders, check collisions and edit layouts in chat. SAM 3D models are not connected yet.',
        readme=(ROOT / 'agents' / 'propertylens' / 'README.md').read_text(encoding='utf8'),
        starter_prompts=['Check your capabilities and load the synthetic demo house.',
                         'Connect my workspace with code ...',
                         'Find a small grey two-seat IKEA sofa for my living room.'],
        metadata={'is_public': True, 'tags': ['interior design', 'ikea', 'floor plans']},
    )
    register_agent(request, config, RegistrationRequestCredentials(
        agentverse_api_key=key, agent_seed_phrase=seed,
    ))
    print('PropertyLens registered as an active ACP mailbox agent. Verify the profile and Chat with Agent in Agentverse.')


if __name__ == '__main__':
    try:
        register()
    except Exception as error:
        # Never print provider response bodies, private tokens or seed values.
        print('Registration failed (' + type(error).__name__ + '). Check the Agentverse key and account permissions.')
        raise SystemExit(1)
