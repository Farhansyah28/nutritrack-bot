require('dotenv').config();

const NINEROUTER_API_KEY = process.env.NINEROUTER_API_KEY || 'dummy';
const NINEROUTER_BASE_URL = process.env.NINEROUTER_BASE_URL || 'http://localhost:20128/v1';
const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o-mini';

/**
 * Mengirimkan Input (Gambar atau Teks) ke AI untuk dianalisa
 */
async function analyzeInput(imageUrl, textInput = '') {
  if (!NINEROUTER_BASE_URL) {
    throw new Error('Base URL 9Router belum dikonfigurasi!');
  }

  const prompt = `
Anda adalah ahli gizi dan kebugaran. Analisa ${imageUrl ? 'gambar' : 'teks deskripsi'} yang diberikan dan tentukan apakah ini makanan atau aktivitas olahraga.
Tugas Anda adalah membalas HANYA dengan JSON murni tanpa markdown, dengan format berikut:

Jika Makanan:
{
  "type": "food",
  "item_name": "Nama Makanan",
  "calories": Estimasi total kalori dalam angka,
  "fat": Estimasi total lemak (gram) dalam angka,
  "carbs": Estimasi total karbohidrat (gram) dalam angka,
  "protein": Estimasi total protein (gram) dalam angka
}

Jika Olahraga/Aktivitas:
{
  "type": "workout",
  "item_name": "Nama Aktivitas (misal: Lari 5km)",
  "calories": Estimasi kalori terbakar dalam angka
}

Jika tidak jelas atau bukan keduanya:
{
  "type": "unknown",
  "item_name": "Tidak Dikenali",
  "calories": 0
}

Keluarkan HANYA JSON.
`;

  let contentArray = [{ type: "text", text: prompt }];
  
  if (imageUrl) {
    contentArray.push({ type: "image_url", image_url: { url: imageUrl } });
  }
  if (textInput) {
    contentArray.push({ type: "text", text: `Input dari user: "${textInput}"` });
  }

  try {
    const response = await fetch(`${NINEROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NINEROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: AI_MODEL,
        stream: false,
        messages: [
          {
            role: "user",
            content: contentArray
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('9Router API Error:', errorText);
      throw new Error(`Gagal menghubungi AI melalui 9Router (Status: ${response.status})`);
    }

    const text = await response.text();
    let content = '';

    if (text.includes('data: ')) {
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const chunk = JSON.parse(line.slice(6));
            if (chunk.choices && chunk.choices[0]) {
              const delta = chunk.choices[0].delta;
              const msg = chunk.choices[0].message;
              if (delta && delta.content) content += delta.content;
              else if (msg && msg.content) content += msg.content;
            }
          } catch (e) {}
        }
      }
    } else {
      const data = JSON.parse(text);
      content = data.choices[0].message.content;
    }
    
    // Parsing JSON
    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error('JSON Parse Error:', content);
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('Format balasan AI tidak sesuai ekspektasi.');
    }
  } catch (error) {
    console.error('AI Service Error:', error);
    throw error;
  }
}

module.exports = {
  analyzeInput
};
