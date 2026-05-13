const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE_NAME = process.env.EVO_INSTANCE_NAME || '';

async function sendMessage(number, text) {
  if (!EVO_API_URL || !EVO_API_KEY || !EVO_INSTANCE_NAME) {
    throw new Error('Evolution API não configurada. Verifique EVO_API_URL, EVO_API_KEY e EVO_INSTANCE_NAME no .env');
  }

  const url = `${EVO_API_URL}/message/sendText/${EVO_INSTANCE_NAME}`;

  const body = JSON.stringify({ number, text });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_API_KEY
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Evolution API erro ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function checkStatus() {
  if (!EVO_API_URL || !EVO_API_KEY || !EVO_INSTANCE_NAME) {
    return { connected: false, error: 'API não configurada' };
  }

  try {
    const url = `${EVO_API_URL}/instance/connectionState/${EVO_INSTANCE_NAME}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': EVO_API_KEY }
    });

    if (!response.ok) {
      return { connected: false, error: `Status ${response.status}` };
    }

    const data = await response.json();
    return {
      connected: data.instance?.state === 'open' || data.state === 'open',
      state: data.instance?.state || data.state || 'unknown',
      instance: EVO_INSTANCE_NAME
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

function isConfigured() {
  return !!(EVO_API_URL && EVO_API_KEY && EVO_INSTANCE_NAME);
}

module.exports = { sendMessage, checkStatus, isConfigured };
