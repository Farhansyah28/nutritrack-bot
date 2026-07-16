require('dotenv').config();
const { analyzeImage } = require('./ai');

async function test() {
  try {
    const res = await analyzeImage("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Good_Food_Display_-_NCI_Visuals_Online.jpg/800px-Good_Food_Display_-_NCI_Visuals_Online.jpg");
    console.log("Success:", res);
  } catch(e) {
    console.error("Test Error:", e);
  }
}
test();
