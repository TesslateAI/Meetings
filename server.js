const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const port = process.env.PORT || 3021;

// --- Middleware ---
app.use(cors()); // Allow requests from frontend (useful in development)
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS)

// --- In-Memory Data Store (Replace with Database for Production) ---
const events = {};
/*
Structure of events object:
events = {
  "event-id-123": {
    id: "event-id-123",
    title: "Team Lunch",
    dates: ["2023-10-28", "2023-10-29"], // YYYY-MM-DD format
    startTime: "11:00", // HH:MM format (24-hour)
    endTime: "14:00",   // HH:MM format (24-hour)
    timeZone: "America/New_York", // IANA timezone name
    participants: {
      // name: { dateTimeISO: true, dateTimeISO: true, ... }
      "Alice": {
         "2023-10-28T15:00:00.000Z": true, // Example: Storing UTC ISO strings
         "2023-10-28T15:30:00.000Z": true
       },
      "Bob": { ... }
    }
  },
  // ... more events
};
*/

// --- API Routes ---

// Create a new event
app.post('/api/events', (req, res) => {
    try {
        const { title, dates, startTime, endTime, timeZone } = req.body;

        // Basic validation
        if (!Array.isArray(dates) || dates.length === 0 || !startTime || !endTime || !timeZone) {
            return res.status(400).json({ message: 'Missing required fields: dates, startTime, endTime, timeZone' });
        }

        const eventId = uuidv4().substring(0, 8); // Shorter, easier ID
        const newEvent = {
            id: eventId,
            title: title || '', // Ensure title is at least an empty string
            dates: dates.map(d => d.split('T')[0]).sort(), // Store just YYYY-MM-DD, sort them
            startTime,
            endTime,
            timeZone,
            participants: {}, // Initialize empty participants
            createdAt: new Date().toISOString(),
        };

        events[eventId] = newEvent;
        console.log(`Event created: ${eventId} - ${title}`);
        res.status(201).json({ id: eventId, ...newEvent }); // Send back the created event details

    } catch (error) {
        console.error("Error creating event:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Get event details (including participant availability)
app.get('/api/events/:id', (req, res) => {
    try {
        const eventId = req.params.id;
        const event = events[eventId];

        if (event) {
            res.status(200).json(event);
        } else {
            res.status(404).json({ message: 'Event not found' });
        }
    } catch (error) {
        console.error(`Error fetching event ${req.params.id}:`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Save or update participant availability for an event
app.post('/api/events/:id/availability', (req, res) => {
    try {
        const eventId = req.params.id;
        const { name, availability } = req.body; // availability should be { dateTimeISO: true, ... }

        if (!name || typeof availability !== 'object') {
            return res.status(400).json({ message: 'Missing required fields: name, availability object' });
        }

        const event = events[eventId];
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Update or add participant's availability
        // We simply replace their entire availability map with the new one sent
        event.participants[name] = availability;

        console.log(`Availability updated for ${name} in event ${eventId}`);

        // Respond with the *entire updated event object* so frontend heatmap/list is correct
        res.status(200).json(event);

    } catch (error) {
         console.error(`Error saving availability for event ${req.params.id}:`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// --- Fallback for SPA routing (Optional but good practice) ---
// This makes sure that if someone directly navigates to example.com/#eventid,
// the server still sends index.html, and the frontend JS handles the hash.
// app.get('/*', (req, res) => {
//    // Check if the request looks like it's for an API endpoint
//     if (req.path.startsWith('/api/')) {
//          res.status(404).send('API endpoint not found');
//     } else {
//         // Otherwise, send the main HTML file
//         res.sendFile(path.join(__dirname, 'public', 'index.html'));
//     }
// });


// --- Start Server ---
app.listen(port, () => {
    console.log(`Tessalate server listening at http://localhost:${port}`);
});