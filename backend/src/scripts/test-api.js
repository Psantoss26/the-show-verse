import '../config/load-env.js';
import { signAccessToken } from '../lib/jwt.js';

async function main() {
  const token = await signAccessToken({ sub: 'a873fe86-c872-4dd4-a4e6-60582f2aa370' });
  console.log('Generated token for test user.');
  
  const payload = {
    tmdbId: 49013,
    mediaType: 'movie',
    watchedAt: new Date().toISOString(),
    title: 'El curioso caso de Benjamin Button',
    posterPath: '/something.jpg'
  };
  
  console.log('Sending payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch('http://localhost:3001/v1/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Response Status:', response.status);
    const json = await response.json();
    console.log('Response Body:', JSON.stringify(json, null, 2));
  } catch (error) {
    console.error('Fetch failed:', error);
  }
}
main();
