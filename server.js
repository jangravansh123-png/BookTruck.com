
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const fs = require("fs");
const path = require("path");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Supabase environment variables are missing.");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
  );

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "bookings.json");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));


function mapBooking(row) {
  return {
    id: row.booking_code,
    customer: row.customer,
    phone: row.phone,
    pickup: row.pickup,
    drop: row.drop_location,
    truckType: row.truck_type,
    goods: row.goods || "General goods",
    weightKg: Number(row.weight_kg) || 0,
    pickupDate: row.pickup_date || "",
    notes: row.notes || "",
    status: row.status,
    driverDecision: row.driver_decision,
    driverEarning: Number(row.driver_earning) || 0,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    location:
      row.latitude != null && row.longitude != null
        ? {
            lat: Number(row.latitude),
            lng: Number(row.longitude),
            updatedAt: row.location_updated_at,
          }
        : null,
  };
}

function safeBooking(row) {
  const booking = mapBooking(row);
  const { phone, ...safe } = booking;
  return safe;
}

function handleDbError(error, res, message = "Database operation failed.") {
  console.error(message, error.message);
  return res.status(500).json({ error: message });
}

async function getBookingByCode(code) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_code", String(code).trim())
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const { error } = await supabase
      .from("bookings")
      .select("id")
      .limit(1);

    if (error) throw error;

    res.json({ ok: true, service: "BookTruck API", database: "connected" });
  } catch (error) {
    handleDbError(error, res, "Database connection failed.");
  }
});

// Create a booking
app.post("/api/bookings", async (req, res) => {
  try {
    const data = req.body || {};
    const required = ["customer", "phone", "pickup", "drop", "truckType"];
    const missing = required.filter(
      key => !String(data[key] || "").trim()
    );

    if (missing.length) {
      return res.status(400).json({
        error: "Please complete all required fields.",
        missing,
      });
    }

    const weightKg = Number(data.weightKg || 0);
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      return res.status(400).json({ error: "Invalid weight." });
    }

    const pickupDate = String(data.pickupDate || "").trim();
    if (pickupDate && !/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
      return res.status(400).json({ error: "Invalid pickup date." });
    }

    const bookingCode =
      "BT" +
      Date.now().toString().slice(-8) +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const newBooking = {
      booking_code: bookingCode,
      customer: String(data.customer).trim(),
      phone: String(data.phone).trim(),
      pickup: String(data.pickup).trim(),
      drop_location: String(data.drop).trim(),
      truck_type: String(data.truckType).trim(),
      goods: String(data.goods || "General goods").trim(),
      weight_kg: weightKg,
      pickup_date: pickupDate || null,
      notes: String(data.notes || "").trim(),
      status: "Booking Received",
      driver_decision: "Pending",
      driver_earning: 0,
    };

    const { data: row, error } = await supabase
      .from("bookings")
      .insert(newBooking)
      .select("*")
      .single();

    if (error) throw error;

    res.status(201).json({
      message: "Booking created.",
      booking: mapBooking(row),
    });
  } catch (error) {
    handleDbError(error, res, "Could not create booking.");
  }
});

// Driver: pending requests
app.get("/api/driver/requests", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("driver_decision", "Pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ requests: data.map(safeBooking) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Driver: accepted deliveries
app.get("/api/driver/deliveries", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("driver_decision", "Accepted")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ deliveries: data.map(safeBooking) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Accept a delivery
app.patch("/api/bookings/:id/accept", async (req, res) => {
  try {
    const existing = await getBookingByCode(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (existing.driver_decision !== "Pending") {
      return res.status(409).json({ error: "Request already processed." });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({
        driver_decision: "Accepted",
        status: "Confirmed",
        accepted_at: new Date().toISOString(),
      })
      .eq("booking_code", existing.booking_code)
      .eq("driver_decision", "Pending")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(409).json({ error: "Request already processed." });
    }

    res.json({ message: "Delivery accepted.", booking: safeBooking(data) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Reject a delivery
app.patch("/api/bookings/:id/reject", async (req, res) => {
  try {
    const existing = await getBookingByCode(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (existing.driver_decision !== "Pending") {
      return res.status(409).json({ error: "Request already processed." });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({ driver_decision: "Rejected" })
      .eq("booking_code", existing.booking_code)
      .eq("driver_decision", "Pending")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(409).json({ error: "Request already processed." });
    }

    res.json({ message: "Delivery rejected.", booking: safeBooking(data) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Update delivery status
app.patch("/api/bookings/:id/status", async (req, res) => {
  try {
    const transitions = {
      Confirmed: ["Picked Up", "Cancelled"],
      "Picked Up": ["In Transit", "Cancelled"],
      "In Transit": ["Delivered"],
      Delivered: [],
      Cancelled: [],
    };

    const allowed = ["Picked Up", "In Transit", "Delivered", "Cancelled"];

    if (!allowed.includes(req.body?.status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const booking = await getBookingByCode(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (booking.driver_decision !== "Accepted") {
      return res.status(409).json({
        error: "Accept the delivery before updating status.",
      });
    }

    if (!transitions[booking.status]?.includes(req.body.status)) {
      return res.status(409).json({
        error: `Cannot change ${booking.status} to ${req.body.status}.`,
      });
    }

    const changes = { status: req.body.status };

    if (req.body.status === "Delivered") {
      changes.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(changes)
      .eq("booking_code", booking.booking_code)
      .eq("status", booking.status)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(409).json({
        error: "Booking status changed. Refresh and try again.",
      });
    }

    res.json({ message: "Status updated.", booking: safeBooking(data) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Save driver earnings
app.patch("/api/bookings/:id/earning", async (req, res) => {
  try {
    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      return res.status(400).json({ error: "Invalid earning amount." });
    }

    const booking = await getBookingByCode(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (
      booking.driver_decision !== "Accepted" ||
      booking.status !== "Delivered"
    ) {
      return res.status(409).json({
        error: "Only delivered bookings can have earnings recorded.",
      });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({ driver_earning: amount })
      .eq("booking_code", booking.booking_code)
      .eq("status", "Delivered")
      .select("*")
      .single();

    if (error) throw error;

    res.json({ message: "Earning saved.", booking: safeBooking(data) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Driver earnings summary
app.get("/api/driver/earnings", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("driver_decision", "Accepted")
      .eq("status", "Delivered")
      .order("completed_at", { ascending: false });

    if (error) throw error;

    const totalEarnings = data.reduce(
      (sum, row) => sum + (Number(row.driver_earning) || 0),
      0
    );

    res.json({
      currency: "INR",
      completedDeliveries: data.length,
      totalEarnings,
      deliveries: data.map(safeBooking),
    });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Update GPS location for an active delivery
app.patch("/api/bookings/:id/location", async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({ error: "Invalid coordinates." });
    }

    const booking = await getBookingByCode(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (
      booking.driver_decision !== "Accepted" ||
      !["Picked Up", "In Transit"].includes(booking.status)
    ) {
      return res.status(409).json({
        error: "Delivery must be active before sharing location.",
      });
    }

    const { data, error } = await supabase
      .from("bookings")
      .update({
        latitude: lat,
        longitude: lng,
        location_updated_at: new Date().toISOString(),
      })
      .eq("booking_code", booking.booking_code)
      .select("*")
      .single();

    if (error) throw error;

    res.json({ message: "Location updated.", booking: safeBooking(data) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Track a shipment by booking ID
app.get("/api/bookings/:id", async (req, res) => {
  try {
    const booking = await getBookingByCode(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Booking ID not found." });
    }

    res.json({ booking: safeBooking(booking) });
  } catch (error) {
    handleDbError(error, res);
  }
});

// Keep fallback after API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`BookTruck running at http://localhost:${PORT}`);
});
