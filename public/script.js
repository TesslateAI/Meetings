document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = ''; // Same origin, leave empty or use relative path /api

    // --- DOM Elements ---
    const createEventSection = document.getElementById('create-event-section');
    const shareLinkSection = document.getElementById('share-link-section');
    const eventViewSection = document.getElementById('event-view-section');

    const createEventForm = document.getElementById('create-event-form');
    const eventLinkInput = document.getElementById('event-link');
    const copyLinkButton = document.getElementById('copy-link-button');
    const copyStatus = document.getElementById('copy-status');
    const viewEventLink = document.getElementById('view-event-link');

    const eventViewTitle = document.getElementById('event-view-title');
    const eventViewTimezone = document.getElementById('event-view-timezone');
    const participantNameInput = document.getElementById('participant-name');
    const saveAvailabilityButton = document.getElementById('save-availability-button');
    const saveStatus = document.getElementById('save-status');
    const gridContainer = document.getElementById('availability-grid-container');
    const participantList = document.getElementById('participant-list');
    const loadingGrid = document.getElementById('loading-grid');
    const timeZoneSelect = document.getElementById('time-zone');
    const tooltip = document.getElementById('grid-tooltip');

    // NEW Elements for Slot Details
    const slotDetailsDisplay = document.getElementById('slot-details-display');
    const selectedSlotTime = document.getElementById('selected-slot-time');
    const availableList = document.getElementById('available-list');
    const unavailableList = document.getElementById('unavailable-list');
    const clearDetailsButton = document.getElementById('clear-details-button');


    // --- State ---
    let currentEventId = null;
    let currentEventData = null;
    let userAvailability = {}; // Stores {'datetime_iso': true/false}
    let isDragging = false;
    let dragMode = null; // 'select' or 'deselect'

    // NEW State for Slot Details
    let currentlyDetailedSlotISO = null; // Keep track of the ISO string of the selected slot
    let currentlyDetailedCellElement = null; // Keep track of the DOM element selected


    // --- Initialization ---
    populateTimezones();
    checkForEventIdInUrl();

    // --- Event Listeners ---
    createEventForm.addEventListener('submit', handleCreateEvent);
    copyLinkButton.addEventListener('click', handleCopyLink);
    viewEventLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentEventId) {
            window.location.hash = currentEventId; // Trigger hashchange
            loadEventView(currentEventId);
        }
    });
    saveAvailabilityButton.addEventListener('click', handleSaveAvailability);

    participantNameInput.addEventListener('input', loadUserAvailabilityIfNameExists);

    // Use event delegation for grid interaction
    gridContainer.addEventListener('mousedown', handleGridMouseDown);
    gridContainer.addEventListener('mouseover', handleGridMouseOver);
    // Listen on the whole document for mouseup to stop dragging anywhere
    document.addEventListener('mouseup', handleGridMouseUp);
    // Add touch events for mobile dragging
    gridContainer.addEventListener('touchstart', handleGridTouchStart, { passive: false });
    gridContainer.addEventListener('touchmove', handleGridTouchMove, { passive: false });
    gridContainer.addEventListener('touchend', handleGridTouchEnd);

    // Tooltip listeners
    gridContainer.addEventListener('mouseover', handleTooltipShow);
    gridContainer.addEventListener('mouseout', handleTooltipHide);

    // NEW: Listener for clicking on a slot to show details
    gridContainer.addEventListener('click', handleSlotDetailClick);
    clearDetailsButton.addEventListener('click', clearSlotDetailsView); // Add listener for the clear button

    // Handle browser back/forward navigation for hash changes
    window.addEventListener('hashchange', checkForEventIdInUrl);


    // --- Functions ---

    function populateTimezones() {
        const timezones = Intl.supportedValuesOf('timeZone');
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz.replace(/_/g, ' '); // Make it more readable
            if (tz === userTimeZone) {
                option.selected = true;
            }
            timeZoneSelect.appendChild(option);
        });
    }

    function checkForEventIdInUrl() {
        const eventId = window.location.hash.substring(1); // Get ID from #...
        if (eventId) {
            currentEventId = eventId;
            loadEventView(eventId);
        } else {
            showSection('create');
            currentEventId = null;
            currentEventData = null;
            clearSlotDetailsView(); // Ensure details are hidden on homepage
        }
    }

    async function handleCreateEvent(e) {
        e.preventDefault();
        const formData = new FormData(createEventForm);
        const dates = formData.getAll('dates'); // Get all selected dates
        const data = {
            title: formData.get('title'),
            dates: dates,
            startTime: formData.get('startTime'),
            endTime: formData.get('endTime'),
            timeZone: formData.get('timeZone')
        };

        // Basic validation
        if (!dates || dates.length === 0 || !data.startTime || !data.endTime || !data.timeZone) {
             alert('Please select at least one date and specify the time range and timezone.');
             return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();

            currentEventId = result.id;
            const eventUrl = `${window.location.origin}${window.location.pathname}#${result.id}`;
            eventLinkInput.value = eventUrl;
            viewEventLink.href = `#${result.id}`; // Update the direct link
            showSection('share');
            copyStatus.textContent = ''; // Clear previous copy status

        } catch (error) {
            console.error('Error creating event:', error);
            alert('Failed to create event. Please try again.');
        }
    }

    function handleCopyLink() {
        navigator.clipboard.writeText(eventLinkInput.value).then(() => {
            copyStatus.textContent = 'Link copied!';
            setTimeout(() => copyStatus.textContent = '', 2000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            copyStatus.textContent = 'Copy failed.';
        });
    }

    function showSection(section) {
        createEventSection.classList.add('hidden');
        shareLinkSection.classList.add('hidden');
        eventViewSection.classList.add('hidden');

        if (section === 'create') createEventSection.classList.remove('hidden');
        if (section === 'share') shareLinkSection.classList.remove('hidden');
        if (section === 'view') eventViewSection.classList.remove('hidden');
    }

    async function loadEventView(eventId) {
        showSection('view');
        loadingGrid.classList.remove('hidden');
        gridContainer.innerHTML = ''; // Clear previous grid content first
        gridContainer.appendChild(loadingGrid); // Show loading inside container
        participantList.innerHTML = '<li>Loading participants...</li>'; // Reset participant list
        clearSlotDetailsView(); // Clear details when loading a new event view

        try {
            const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`);
            if (!response.ok) {
                 if (response.status === 404) throw new Error('Event not found');
                 throw new Error(`HTTP error! status: ${response.status}`);
            }
            currentEventData = await response.json();

            eventViewTitle.textContent = currentEventData.title || 'Availability Schedule';
            eventViewTimezone.textContent = currentEventData.timeZone.replace(/_/g, ' '); // Display friendly timezone

            // Reset user state for the new event view
            participantNameInput.value = '';
            userAvailability = {};
            saveStatus.textContent = '';

            generateAvailabilityGrid(currentEventData);
            updateParticipantList(currentEventData.participants);
            updateGridHeatmap(currentEventData.participants);

            loadingGrid.classList.add('hidden');

        } catch (error) {
            console.error('Error loading event:', error);
            gridContainer.innerHTML = `<p class="text-red-600 text-center p-4">${error.message}. Please check the link or <a href="${window.location.pathname}" class="text-primary underline">create a new event</a>.</p>`;
            eventViewTitle.textContent = 'Error Loading Event';
            participantList.innerHTML = '';
            clearSlotDetailsView(); // Also clear details on error
            showSection('view'); // Keep the section visible to show the error
        }
    }

    function generateAvailabilityGrid(eventData) {
        const { dates, startTime, endTime, timeZone } = eventData;
        gridContainer.innerHTML = ''; // Clear loading/previous grid
        userAvailability = {}; // Reset local selection state

        const table = document.createElement('table');
        table.className = 'w-full border-collapse'; // Tailwind classes for table

        // --- Generate Time Slots ---
        const timeSlots = [];
        let current = parseTime(startTime);
        const end = parseTime(endTime);
        const intervalMinutes = 30; // 30-minute slots

        while (current <= end) {
            timeSlots.push(formatTime(current));
            current.setMinutes(current.getMinutes() + intervalMinutes);
            if (formatTime(current) === endTime && startTime !== endTime) {
                if (!timeSlots.includes(endTime)) timeSlots.push(endTime);
                 break;
            } else if (current > end) {
                 break;
            }
        }
         if (!timeSlots.includes(endTime) && startTime !== endTime) {
             timeSlots.push(endTime);
         }
         timeSlots.sort((a, b) => parseTime(a) - parseTime(b));


        // --- Create Header Row ---
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const dateHeaderCell = document.createElement('th');
        dateHeaderCell.className = 'time-slot header date-label';
        headerRow.appendChild(dateHeaderCell);

        timeSlots.forEach(time => {
            const th = document.createElement('th');
            th.className = 'time-slot header';
            th.textContent = formatDisplayTime(time, timeZone);
            headerRow.appendChild(th);
        });

        // --- Create Data Rows (one per date) ---
        const tbody = table.createTBody();
        dates.sort((a, b) => new Date(a) - new Date(b));

        dates.forEach(dateStr => {
            const row = tbody.insertRow();
            const dateCell = row.insertCell();
            dateCell.className = 'time-slot date-label';
            dateCell.textContent = formatDateDisplay(dateStr, timeZone);
            row.appendChild(dateCell);

            timeSlots.forEach(time => {
                const cell = row.insertCell();
                cell.className = 'time-slot';
                const dateTimeISO = combineDateAndTime(dateStr, time, timeZone);
                cell.dataset.datetime = dateTimeISO;

                userAvailability[dateTimeISO] = false; // Initialize

                cell.dataset.tooltipText = formatDateTimeForTooltip(dateTimeISO, timeZone);

                row.appendChild(cell);
            });
        });

        gridContainer.appendChild(table);
    }

     function parseTime(timeStr) { // Expects HH:MM
        const [hours, minutes] = timeStr.split(':').map(Number);
        const date = new Date(0); // Use epoch date to avoid DST issues with just time
        date.setUTCHours(hours, minutes, 0, 0);
        return date;
    }

    function formatTime(date) { // Outputs HH:MM from UTC Date object
        return date.toISOString().substring(11, 16);
    }

    function combineDateAndTime(dateStr, timeStr, timeZone) {
        // Attempts to create a UTC ISO string representing the given date/time *in the specified timezone*.
        try {
            // 1. Create a date object assuming the input IS ALREADY in the target timezone.
            //    We achieve this by temporarily setting the system timezone for parsing. (Not ideal but often works)
            //    A better approach involves libraries like date-fns-tz or Luxon.
            //    Let's try a method using Intl that avoids system timezone changes.

            // Construct a string that Intl can parse correctly with timezone context.
            // Example: If dateStr="2024-03-10", timeStr="02:30", timeZone="America/New_York" (during DST switch)
            // This is tricky. A robust solution needs careful handling of local time ambiguity.

            // Simplification: Assume backend stores UTC. Send date, time, timezone separately.
            // For frontend consistency and keying, create a UTC ISO string.
            // Method: Create date as if local, get its offset FOR THAT DATE/TIME in the TARGET zone, adjust to UTC.

            const [year, month, day] = dateStr.split('-').map(Number);
            const [hour, minute] = timeStr.split(':').map(Number);

            // Create a date object with these parts *interpreted as being in the target timezone*.
            // The JS Date object itself doesn't store timezone, only represents an instant in time (usually based on system TZ or UTC).
            // We need to find the UTC instant that corresponds to year-month-day hour:minute *in* timeZone.

            // Use Intl.DateTimeFormat to find the offset for that zone at roughly that time.
            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timeZone, timeZoneName: 'longOffset' });
             // Use a date near the target date to get the offset. Mid-year avoids DST switches often.
            const sampleDateForOffset = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use noon UTC of the date
            const parts = formatter.formatToParts(sampleDateForOffset);
            const offsetString = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0'; // e.g., GMT-04:00

            // Parse the offset string (e.g., "GMT-04:00") into minutes
            let offsetMinutes = 0;
            const offsetMatch = offsetString.match(/GMT([+-])(\d{2}):(\d{2})/);
            if (offsetMatch) {
                const sign = offsetMatch[1] === '-' ? -1 : 1;
                const hoursOffset = parseInt(offsetMatch[2], 10);
                const minutesOffset = parseInt(offsetMatch[3], 10);
                offsetMinutes = sign * (hoursOffset * 60 + minutesOffset);
            }

            // Create the date in UTC by taking the intended local time and subtracting the offset
            // Date.UTC expects month 0-11
            const utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
            // Adjust by the offset to get the actual UTC time instant
            const targetUtcMillis = utcMillis - (offsetMinutes * 60 * 1000);
            const finalDate = new Date(targetUtcMillis);

            // Validate: Check if the constructed date, when formatted back to the target timezone, matches the input hour/minute
            const checkFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', hour12: false});
            const checkParts = checkFormatter.formatToParts(finalDate);
            const checkHour = checkParts.find(p => p.type === 'hour')?.value;
            const checkMinute = checkParts.find(p => p.type === 'minute')?.value;

            // If the check fails (e.g., due to DST transition hour), log a warning but proceed. Might be off by an hour.
            if (checkHour !== (hour < 10 ? '0' + hour : String(hour)) || checkMinute !== (minute < 10 ? '0' + minute : String(minute)) ) {
                 // Handle "24" hour case from Intl
                 if (!(checkHour === '24' && hour === 0)) {
                     console.warn(`Timezone conversion check mismatch for ${dateStr} ${timeStr} ${timeZone}. Expected ${hour}:${minute}, got ${checkHour}:${checkMinute}. Using calculated UTC.`);
                 }
            }

             return finalDate.toISOString(); // Return standard UTC ISO string

        } catch (e) {
             console.error("Error creating ISO string for", dateStr, timeStr, timeZone, e);
             // Fallback: Simple concatenation (likely incorrect timezone-wise, but unique key)
             return `${dateStr}T${timeStr}:00.000Z`;
        }
    }


    // Helper to get timezone offset in minutes for a specific date and timezone (REPLACED by inline logic in combineDateAndTime)
    /* function getTimezoneOffsetMinutes(timeZone, date) { ... } */


    function formatDisplayTime(timeStr, timeZone) {
         // Displays time in short format (e.g., 9:30 AM) according to event's timezone
         const dummyDate = new Date(`1970-01-01T${timeStr}:00Z`); // Treat time as UTC for formatting base
         try {
            // Format this UTC time *as it would appear* in the target timezone
            return new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                hour: 'numeric',
                minute: '2-digit',
                // hour12: true // Optional: use AM/PM
            }).format(dummyDate);
        } catch (e) {
            console.error("Error formatting time", timeStr, timeZone, e);
            return timeStr; // Fallback
        }
    }

    function formatDateDisplay(dateStr, timeZone) {
        // Displays date like "Mon, Oct 28"
        const date = new Date(dateStr + 'T12:00:00Z'); // Use noon UTC of the date to avoid timezone boundary issues
         try {
            // Format this UTC instant *as it would appear* in the target timezone
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            });
             return formatter.format(date);

        } catch (e) {
            console.error("Error formatting date", dateStr, timeZone, e);
            return dateStr; // Fallback
        }
    }

     function formatDateTimeForTooltip(isoString, timeZone) {
        const date = new Date(isoString);
         try {
            return new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                dateStyle: 'medium', // e.g., Oct 28, 2023
                timeStyle: 'short',  // e.g., 9:30 AM
            }).format(date);
        } catch (e) {
            return isoString; // Fallback
        }
    }

    // --- Grid Interaction Handlers ---

    function handleGridMouseDown(e) {
        const cell = e.target.closest('.time-slot:not(.header):not(.date-label)');
        if (!cell) return;
        // Only start DRAG selection if not clicking the detailed cell
        if (cell === currentlyDetailedCellElement) return;

        e.preventDefault(); // Prevent text selection drag start

        isDragging = true;
        document.body.classList.add('dragging'); // Add class for global cursor style

        const dateTime = cell.dataset.datetime;
        dragMode = !userAvailability[dateTime]; // Determine mode based on first cell

        // Clear details view when starting a drag selection
        if (currentlyDetailedSlotISO) {
            clearSlotDetailsView();
        }

        toggleCellSelection(cell, dateTime); // Toggle the first cell
    }

    function handleGridMouseOver(e) {
        if (!isDragging) return; // Only act if dragging started
        const cell = e.target.closest('.time-slot:not(.header):not(.date-label)');
        if (!cell) return;
        // Don't select the detailed cell during a drag
        if (cell === currentlyDetailedCellElement) return;

        const dateTime = cell.dataset.datetime;
        // Apply selection based on the drag mode
        if (dragMode && !userAvailability[dateTime]) {
            toggleCellSelection(cell, dateTime, true);
        } else if (!dragMode && userAvailability[dateTime]) {
            toggleCellSelection(cell, dateTime, false);
        }
    }

    function handleGridMouseUp(e) {
        if (isDragging) {
            isDragging = false;
            dragMode = null;
            document.body.classList.remove('dragging');
        }
    }

    // Touch Event Handlers
    let lastTouchedCell = null;

    function handleGridTouchStart(e) {
        const cell = e.target.closest('.time-slot:not(.header):not(.date-label)');
        if (!cell) return;
        // Only start DRAG selection if not touching the detailed cell
        if (cell === currentlyDetailedCellElement) return;

        // Don't prevent default always, allow scrolling if not on a cell initially
        // e.preventDefault(); // Might prevent scrolling, use carefully

        isDragging = true; // Use the same dragging flag
        const dateTime = cell.dataset.datetime;
        dragMode = !userAvailability[dateTime];

         // Clear details view when starting a drag selection
        if (currentlyDetailedSlotISO) {
            clearSlotDetailsView();
        }

        toggleCellSelection(cell, dateTime);
        lastTouchedCell = cell;
    }

    function handleGridTouchMove(e) {
        if (!isDragging) return;
        e.preventDefault(); // Prevent page scroll while dragging selection

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = element ? element.closest('.time-slot:not(.header):not(.date-label)') : null;

        if (cell && cell !== lastTouchedCell) {
             // Don't select the detailed cell during a drag
            if (cell === currentlyDetailedCellElement) return;

            const dateTime = cell.dataset.datetime;
             if (dragMode && !userAvailability[dateTime]) {
                toggleCellSelection(cell, dateTime, true);
            } else if (!dragMode && userAvailability[dateTime]) {
                toggleCellSelection(cell, dateTime, false);
            }
            lastTouchedCell = cell;
        }
    }

    function handleGridTouchEnd(e) {
        if (isDragging) {
            isDragging = false;
            dragMode = null;
            lastTouchedCell = null;
        }
    }


    // --- Tooltip Handlers ---
     function handleTooltipShow(e) {
        // Don't show tooltip if dragging selection
        if (isDragging) {
             handleTooltipHide();
             return;
         }
        const cell = e.target.closest('.time-slot:not(.header):not(.date-label)');
        if (!cell || !currentEventData || !currentEventData.participants) {
            handleTooltipHide();
            return;
        }

        const dateTime = cell.dataset.datetime;
        const availableNames = getAvailableNamesForSlot(dateTime);

        if (availableNames.length > 0) {
            tooltip.innerHTML = `<strong>Available:</strong><br>${availableNames.slice(0, 10).join('<br>')}${availableNames.length > 10 ? '<br>...' : ''}`; // Limit tooltip length
        } else {
            tooltip.innerHTML = 'No one available';
        }

        // Position Tooltip
        const rect = cell.getBoundingClientRect();
        const containerRect = gridContainer.getBoundingClientRect();

        let top = rect.top - containerRect.top + gridContainer.scrollTop - tooltip.offsetHeight - 5; // 5px buffer
        let left = rect.left - containerRect.left + gridContainer.scrollLeft + rect.width / 2;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.classList.remove('hidden');

        // Adjust if tooltip goes off-screen
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.left < containerRect.left) {
             tooltip.style.left = `${gridContainer.scrollLeft + 5}px`;
             tooltip.style.transform = 'translate(0, -110%)';
        }
         if (tooltipRect.right > (containerRect.right - 5)) { // Add small buffer on right
             tooltip.style.left = `${gridContainer.scrollLeft + containerRect.width - tooltip.offsetWidth - 5}px`;
             tooltip.style.transform = 'translate(0, -110%)';
        }
         if (tooltipRect.top < containerRect.top) {
              tooltip.style.top = `${rect.bottom - containerRect.top + gridContainer.scrollTop + 5}px`;
              tooltip.style.transform = 'translate(-50%, 10%)';
         }
    }

    function handleTooltipHide() {
        tooltip.classList.add('hidden');
    }


    function getAvailableNamesForSlot(dateTimeISO) {
        const names = [];
        if (!currentEventData || !currentEventData.participants) return names;

        // Sort names alphabetically for consistent tooltip order
        const sortedNames = Object.keys(currentEventData.participants).sort();

        for (const name of sortedNames) {
            if (currentEventData.participants[name] && currentEventData.participants[name][dateTimeISO]) {
                names.push(name);
            }
        }
        return names;
    }

     // --- Cell Selection/Marking Logic ---
     function toggleCellSelection(cell, dateTime, forceState = null) {
         // We already checked in mousedown/touchstart that this isn't the detailed cell
         const currentState = userAvailability[dateTime];
         const newState = (forceState !== null) ? forceState : !currentState;

         if (newState) {
             cell.classList.add('selected');
             // Remove heatmap class if it exists, selection overrides heatmap
             cell.className = cell.className.replace(/\bheatmap-\d+\b/g, '').trim();
             userAvailability[dateTime] = true;
         } else {
             cell.classList.remove('selected');
             userAvailability[dateTime] = false;
             // Re-apply heatmap after deselecting (will be done globally by updateGridHeatmap)
             // We don't need to do it per-cell here, just remove 'selected'
         }
         // Ensure heatmap is updated after selection changes
         updateGridHeatmap(currentEventData?.participants || {});
     }


    // --- Slot Detail Click Handler ---
    function handleSlotDetailClick(e) {
        // Don't trigger details view if a drag operation just finished on this cell
        if (isDragging) return;
        // Find the target cell
        const cell = e.target.closest('.time-slot:not(.header):not(.date-label)');
        if (!cell || !currentEventData) return; // Must be a data cell with event loaded

        // Don't trigger if the user is selecting text within the name input/saving etc.
        // Although click is on gridContainer, check if target is inside certain areas? - No, click target handles it.

        const dateTimeISO = cell.dataset.datetime;

        // Prevent detail view if a drag just ended (mouseup might fire before click sometimes)
        // A small delay might be needed if issues persist, but let's try without first.

        // If clicking the *same* cell that's already detailed, clear it
        if (dateTimeISO === currentlyDetailedSlotISO) {
            clearSlotDetailsView();
            return;
        }

        // --- Update the Details View ---
        clearSlotDetailsView(); // Clear previous selection first

        currentlyDetailedSlotISO = dateTimeISO;
        currentlyDetailedCellElement = cell;

        // Add visual highlight to the clicked cell
        cell.classList.add('selected-for-details');
         // Remove heatmap from detailed cell for clarity
         cell.className = cell.className.replace(/\bheatmap-\d+\b/g, '').trim();

        // Populate the details section
        selectedSlotTime.textContent = formatDateTimeForTooltip(dateTimeISO, currentEventData.timeZone);

        const participants = currentEventData.participants || {};
        const allParticipantNames = Object.keys(participants).sort();
        const availableNames = [];
        const unavailableNames = [];

        if (allParticipantNames.length === 0) {
             availableList.innerHTML = '<li class="text-gray-500 italic">No participants yet</li>';
             unavailableList.innerHTML = '<li class="text-gray-500 italic">No participants yet</li>';
        } else {
            allParticipantNames.forEach(name => {
                 if (participants[name] && participants[name][dateTimeISO]) {
                    availableNames.push(name);
                } else {
                    // Only list as unavailable if they have submitted *any* availability for this event
                    // Otherwise, they just haven't responded yet.
                    // We list everyone who HAS submitted, and categorize them for this slot.
                    unavailableNames.push(name);
                }
            });

            renderNameList(availableList, availableNames, '(None Available)');
            renderNameList(unavailableList, unavailableNames, '(Everyone Available or Not Responded)');
        }

        slotDetailsDisplay.classList.remove('hidden');
        slotDetailsDisplay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // --- Helper to render name lists ---
     function renderNameList(ulElement, names, emptyMessage) {
        ulElement.innerHTML = '';
        if (names.length === 0) {
            ulElement.innerHTML = `<li class="text-gray-500 italic">${emptyMessage}</li>`;
        } else {
            names.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                ulElement.appendChild(li);
            });
        }
    }


    // --- Function to clear the slot details view ---
    function clearSlotDetailsView() {
        if (currentlyDetailedCellElement) {
            currentlyDetailedCellElement.classList.remove('selected-for-details');
             // Re-apply heatmap to the cell that was cleared
             updateGridHeatmap(currentEventData?.participants || {});
        }
        currentlyDetailedSlotISO = null;
        currentlyDetailedCellElement = null;

        slotDetailsDisplay.classList.add('hidden');
        selectedSlotTime.textContent = '(Select a time slot above)';
        availableList.innerHTML = '<li class="text-gray-500 italic">(Select a time slot)</li>';
        unavailableList.innerHTML = '<li class="text-gray-500 italic">(Select a time slot)</li>';
    }


    // --- Availability Saving/Updating ---
    async function handleSaveAvailability() {
        const name = participantNameInput.value.trim();
        if (!name) {
            alert('Please enter your name.');
            participantNameInput.focus();
            return;
        }
        if (!currentEventId) {
            alert('Cannot save availability. Event ID is missing.');
            return;
        }

        const availabilityData = {};
        for (const dt in userAvailability) {
            if (userAvailability[dt]) {
                availabilityData[dt] = true;
            }
        }

        saveStatus.textContent = 'Saving...';
        saveAvailabilityButton.disabled = true;
        clearSlotDetailsView(); // Clear details view before potentially refreshing data

        try {
            const response = await fetch(`${API_BASE_URL}/api/events/${currentEventId}/availability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, availability: availabilityData }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const updatedEventData = await response.json();
            currentEventData = updatedEventData;
            updateParticipantList(updatedEventData.participants);
            updateGridHeatmap(updatedEventData.participants);
            // Reload user's own availability markers after successful save
            loadUserAvailabilityIfNameExists(false); // Pass false to prevent clearing details again

            saveStatus.textContent = 'Availability saved!';
            setTimeout(() => saveStatus.textContent = '', 3000);

        } catch (error) {
            console.error('Error saving availability:', error);
            saveStatus.textContent = 'Save failed.';
            alert('Failed to save availability. Please try again.');
        } finally {
             saveAvailabilityButton.disabled = false;
        }
    }

    function updateParticipantList(participants) {
        participantList.innerHTML = ''; // Clear existing list
        const names = Object.keys(participants || {}).sort(); // Handle potentially null/undefined participants
        if (names.length === 0) {
            participantList.innerHTML = '<li>No participants yet.</li>';
            return;
        }
        names.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            participantList.appendChild(li);
        });
    }

     function updateGridHeatmap(participants) {
         participants = participants || {}; // Ensure participants is an object
         const maxParticipants = Object.keys(participants).length;
         const cells = gridContainer.querySelectorAll('.time-slot[data-datetime]');

         cells.forEach(cell => {
             const dateTime = cell.dataset.datetime;
             let availableCount = 0;
             for (const name in participants) {
                 if (participants[name] && participants[name][dateTime]) {
                     availableCount++;
                 }
             }

             // Remove existing heatmap classes
             cell.className = cell.className.replace(/\bheatmap-\d+\b/g, '').trim();

             let heatmapLevel = 0;
             if (maxParticipants > 0 && availableCount > 0) {
                const ratio = availableCount / maxParticipants;
                 if (ratio > 0 && ratio <= 0.2) heatmapLevel = 1;
                 else if (ratio > 0.2 && ratio <= 0.4) heatmapLevel = 2;
                 else if (ratio > 0.4 && ratio <= 0.6) heatmapLevel = 3;
                 else if (ratio > 0.6 && ratio <= 0.8) heatmapLevel = 4;
                 else if (ratio > 0.8) heatmapLevel = 5;
             }

             // Apply heatmap ONLY if the cell is NOT selected by the user AND NOT selected for details
             if (!cell.classList.contains('selected') && !cell.classList.contains('selected-for-details')) {
                 if (availableCount > 0) {
                    cell.classList.add(`heatmap-${heatmapLevel}`);
                 } else {
                    cell.classList.add('heatmap-0'); // Explicitly mark zero availability
                 }
             }
             // Ensure cells selected by user or for details have no heatmap class
             else if (cell.classList.contains('selected') || cell.classList.contains('selected-for-details')) {
                 cell.className = cell.className.replace(/\bheatmap-\d+\b/g, '').trim();
             }
         });
     }

      // Function to load user's saved availability when they type their name
      // Added 'shouldClearDetails' flag to prevent redundant clearing after save
      function loadUserAvailabilityIfNameExists(shouldClearDetails = true) {
         if (shouldClearDetails) {
            clearSlotDetailsView(); // Clear details when name changes/loads unless specified otherwise
         }
         const name = participantNameInput.value.trim();
         const participantData = currentEventData?.participants?.[name];

         // Reset internal state and visuals first
         userAvailability = {};
         gridContainer.querySelectorAll('.time-slot.selected').forEach(cell => {
             cell.classList.remove('selected');
         });

         // Load saved state if exists
         if (participantData) {
             userAvailability = { ...participantData }; // Load saved state
             gridContainer.querySelectorAll('.time-slot[data-datetime]').forEach(cell => {
                 const dateTime = cell.dataset.datetime;
                 if (userAvailability[dateTime]) {
                     cell.classList.add('selected');
                 }
             });
              if (shouldClearDetails) { // Only show status if not called directly after save
                 saveStatus.textContent = `Loaded availability for ${name}.`;
                 setTimeout(() => saveStatus.textContent = '', 3000);
             }
         } else {
             // Initialize all to false if no data for this name
             gridContainer.querySelectorAll('.time-slot[data-datetime]').forEach(cell => {
                 userAvailability[cell.dataset.datetime] = false;
             });
         }
         // Always update heatmap after loading/clearing user selection
         updateGridHeatmap(currentEventData?.participants || {});
     }

}); // End DOMContentLoaded