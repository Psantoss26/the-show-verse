import '../config/load-env.js';
import { signAccessToken } from '../lib/jwt.js';

async function main() {
  const token = await signAccessToken({ sub: 'e148a324-e498-4494-a961-dbb421fc6571' });
  console.log('Generated token.');
  
  const payload = {
    mainTitle: 'Breaking Bad',
    subTitle: 'Temporada 1: Episodio 2',
    videoId: 70196252
  };
  
  try {
    const response = await fetch('http://localhost:3000/api/netflix/extension-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Status:', response.status);
    const json = await response.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (error) {
    console.error('Request failed:', error);
  }
}
main();
