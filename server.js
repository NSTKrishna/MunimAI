require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser'); // To easily parse JSON body

const app = express();
app.use(bodyParser.json()); // Use body-parser middleware

// --- Load configuration from .env ---
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

// Check if required environment variables are set
if (!VERIFY_TOKEN || !WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("Error: Critical environment variables (VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID) are missing.");
    console.log("Please ensure your .env file is correctly configured.");
    process.exit(1); // Exit if configuration is missing
}

// ===============================================
// 1. WEBHOOK VALIDATION (GET)
// ===============================================
app.get('/webhook', (req, res) => {
    // Read the query parameters sent by Meta
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log("--- WEBHOOK VALIDATION RECEIVED ---");
    console.log(`Mode: ${mode}`);
    console.log(`Token received from Meta: ${token}`);
    console.log(`Local expected token: ${VERIFY_TOKEN}`);
    console.log(`Challenge: ${challenge}`);

    // Check if mode and token are valid
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("Webhook Verified! Returning challenge.");
        // Respond with the challenge token from the request
        res.status(200).send(challenge);
    } else {
        // Respond with '403 Forbidden' if tokens don't match
        console.error("VERIFICATION FAILED: Token or mode mismatch.");
        res.sendStatus(403);
    }
});

// ===============================================
// 2. MESSAGE RECEIVER (POST)
// ===============================================
app.post('/webhook', async (req, res) => {
    const body = req.body;
    console.log("--- INCOMING WHATSAPP MESSAGE ---");
    console.log(JSON.stringify(body, null, 2)); // Log the entire incoming payload

    try {
        // Check if the incoming notification is a WhatsApp message
        if (body.object === 'whatsapp_business_account') {
            body.entry?.forEach(entry => {
                entry.changes?.forEach(change => {
                    // Check if the change is related to messages
                    if (change.field === 'messages') {
                        const value = change.value;

                        // **FIX:** Check if the 'messages' array exists and is not empty
                        if (value?.messages && value.messages.length > 0) {
                            value.messages.forEach(async message => {
                                const from_number = message.from; // Sender's phone number
                                const message_type = message.type;

                                // Basic handling for text messages
                                if (message_type === 'text') {
                                    const text_body = message.text.body;
                                    console.log(`Received from ${from_number}: ${text_body}`);

                                    // Send an automated reply
                                    await sendWhatsAppMessage(from_number, "Thanks for messaging Parul Plastic! We received your message via Node.js.");
                                } else {
                                    console.log(`Received non-text message type: ${message_type} from ${from_number}`);
                                    // Optionally send a generic reply for non-text messages
                                    // await sendWhatsAppMessage(from_number, "Thanks! We received your message.");
                                }
                            });
                        }
                        // Handle status updates (optional, good for logging)
                        else if (value?.statuses && value.statuses.length > 0) {
                             value.statuses.forEach(statusUpdate => {
                                console.log(`--- STATUS UPDATE ---`);
                                console.log(`Message ID: ${statusUpdate.id}, Status: ${statusUpdate.status}, Recipient: ${statusUpdate.recipient_id}`);
                             });
                        }
                         else {
                            console.log("Received a 'messages' field event, but it contained neither messages nor statuses.");
                            console.log(JSON.stringify(value, null, 2)); // Log unexpected payload structure
                        }
                    }
                });
            });
        }
        // Respond with 200 OK to acknowledge receipt
        res.sendStatus(200);
    } catch (error) {
        console.error(`Error processing webhook: ${error.message}`, error);
        res.sendStatus(500); // Internal Server Error
    }
});

// ===============================================
// 3. FUNCTION TO SEND A MESSAGE (OUTBOUND API)
// ===============================================
async function sendWhatsAppMessage(to_number, text) {
    console.log(`Attempting to send reply to ${to_number}: "${text}"`);
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`; // Consider using v19.0 or latest stable

    const headers = {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
    };

    const payload = {
        messaging_product: 'whatsapp',
        to: to_number,
        type: 'text',
        text: {
            body: text
        }
    };

    try {
        const response = await axios.post(url, payload, { headers });
        console.log(`Reply sent successfully to ${to_number}. Status: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`Error sending message via WhatsApp API: ${JSON.stringify(error.response?.data || error.message, null, 2)}`);
        // Don't re-throw here, just log the error
    }
}

// ===============================================
// START THE SERVER
// ===============================================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Ngrok should be tunneling to http://localhost:${PORT}/webhook`);
});

