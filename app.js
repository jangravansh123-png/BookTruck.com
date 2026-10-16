const $ = (selector) => document.querySelector(selector);

$("#year").textContent = new Date().getFullYear();
const dateInput = $("#pickupDate");
if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

$("#menuToggle").addEventListener("click", () => {
  $("#mainNav").classList.toggle("open");
});
document.querySelectorAll("#mainNav a").forEach(link => {
  link.addEventListener("click", () => $("#mainNav").classList.remove("open"));
});

document.querySelectorAll("[data-truck]").forEach(link => {
  link.addEventListener("click", () => {
    $("#bookingForm").elements.truckType.value = link.dataset.truck;
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function showMessage(target, message, isError = false) {
  target.innerHTML = `<div class="result-card${isError ? " error" : ""}">${message}</div>`;
}

$("#bookingForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.innerHTML;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.weightKg = Number(payload.weightKg) || 0;

  button.disabled = true;
  button.textContent = "Creating booking…";
  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create booking.");
    const b = data.booking;
    showMessage($("#bookingResult"),
      `<b>✓ Booking request created!</b><br>Your Booking ID is <b id="newBookingId">${escapeHtml(b.id)}</b>. Save it to track your shipment.<br><button type="button" class="button button-orange" id="copyBookingId">Copy Booking ID</button>`);
    $("#copyBookingId").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.id);
        $("#copyBookingId").textContent = "Copied!";
      } catch {
        $("#copyBookingId").textContent = b.id;
      }
    });
    $("#trackingId").value = b.id;
    form.reset();
    if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
  } catch (error) {
    showMessage($("#bookingResult"), escapeHtml(error.message) + " Is the backend running?", true);
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
});

$("#trackingForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("#trackingId").value.trim();
  const button = event.currentTarget.querySelector("button");
  const originalText = button.innerHTML;
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not find booking.");
    const b = data.booking;
    let locationHtml = "<dt>Latest GPS location</dt><dd>No driver location shared yet.</dd>";
    if (b.location) {
      const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(b.location.lat + "," + b.location.lng)}`;
      locationHtml = `<dt>Latest GPS location</dt><dd>${escapeHtml(b.location.lat)}, ${escapeHtml(b.location.lng)} · <a href="${mapsUrl}" target="_blank" rel="noopener">Open map ↗</a></dd><dt>Location updated</dt><dd>${escapeHtml(new Date(b.location.updatedAt).toLocaleString())}</dd>`;
    }
    showMessage($("#trackingResult"),
      `<b>Shipment ${escapeHtml(b.id)}</b><dl><dt>Status</dt><dd>${escapeHtml(b.status)}</dd><dt>Pickup</dt><dd>${escapeHtml(b.pickup)}</dd><dt>Destination</dt><dd>${escapeHtml(b.drop)}</dd><dt>Truck type</dt><dd>${escapeHtml(b.truckType)}</dd><dt>Pickup date</dt><dd>${escapeHtml(b.pickupDate || "Not selected")}</dd>${locationHtml}</dl>`);
  } catch (error) {
    showMessage($("#trackingResult"), escapeHtml(error.message), true);
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
});