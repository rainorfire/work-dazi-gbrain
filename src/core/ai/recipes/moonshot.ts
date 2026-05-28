import type { Recipe } from '../types.ts';

/**
 * Moonshot AI (月之暗面 / Kimi). OpenAI-compatible /v1/chat/completions at
 * api.moonshot.cn. Distinct from the Anthropic-Messages gateway Kimi also
 * offers — gbrain routes through the OpenAI-compat surface.
 *
 * Reference: https://platform.moonshot.cn/docs/api/chat
 */
export const moonshot: Recipe = {
  id: 'moonshot',
  name: 'Moonshot AI (Kimi)',
  tier: 'openai-compat',
  implementation: 'openai-compatible',
  base_url_default: 'https://api.moonshot.cn/v1',
  auth_env: {
    required: ['MOONSHOT_API_KEY'],
    setup_url: 'https://platform.moonshot.cn/console/api-keys',
  },
  touchpoints: {
    chat: {
      models: [
        'kimi-k2-turbo-preview',
        'kimi-k2-0711-preview',
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
      ],
      supports_tools: true,
      supports_subagent_loop: true,
      supports_prompt_cache: false,
      max_context_tokens: 128000,
      cost_per_1m_input_usd: 0.60,
      cost_per_1m_output_usd: 2.40,
      price_last_verified: '2026-05-27',
    },
  },
  setup_hint:
    'Get an API key at https://platform.moonshot.cn/console/api-keys, then `export MOONSHOT_API_KEY=...`',
};
