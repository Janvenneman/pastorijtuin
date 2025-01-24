"use strict";

const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event, context) => {
  console.log("[SUPABASE RESERVE] Method:", event.httpMethod);
  console.log("[SUPABASE RESERVE] Query params:", event.queryStringParameters);

  // Maak de Supabase client met de service role key (server-side)
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // GET ?mode=get => haal alle slots en bouw blokData structuur
  if (event.httpMethod === "GET") {
    const mode = event.queryStringParameters.mode || "";
    if (mode === "get") {
      try {
        // Haal alle tijdslots
        console.log("[GET] Fetching all rows from 'time_slots'...");
        const { data, error } = await supabase
          .from("time_slots")
          .select("*")
          .order("blok", { ascending: true })
          .order("slot_index", { ascending: true });

        if (error) {
          console.error("[GET] Supabase error:", error);
          return { statusCode: 500, body: "Supabase error: " + error.message };
        }

        // Bouw de blokData structuur
        let blokData = {};
        for (let row of data) {
          const blok = row.blok;
          if (!blokData[blok]) {
            blokData[blok] = {
              date: row.date_str || "",
              timeslots: [],
              selected: []
            };
          }
          blokData[blok].timeslots.push(row.slot_label);
          blokData[blok].selected.push(row.is_selected);
        }

        console.log("[GET] Constructed blokData structure:", blokData);

        return {
          statusCode: 200,
          body: JSON.stringify(blokData)
        };
      } catch (err) {
        console.error("[GET] Unexpected error:", err);
        return { statusCode: 500, body: "Unexpected GET error: " + err.message };
      }
    }
    return { statusCode: 400, body: "Unknown GET mode" };
  }

  // POST => reserveer een tijdslot met concurrency-check
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      console.log("[POST] Received body:", body);

      const blok = body.blok;
      const index = body.index; // 0, 1, 2...

      // Update alleen als is_selected=false
      const { data, error } = await supabase
        .from("time_slots")
        .update({ is_selected: true })
        .eq("blok", blok)
        .eq("slot_index", index)
        .eq("is_selected", false) // Concurrency-check
        .select("*");

      if (error) {
        console.error("[POST] Supabase update error:", error);
        return { statusCode: 500, body: "Update error: " + error.message };
      }

      if (data.length === 0) {
        // Geen rijen geüpdate => conflict
        console.warn("[POST] Conflict, slot already taken or not found");
        return { statusCode: 409, body: "Slot is already taken" };
      }

      // Succes: data[0] is de geüpdatete row
      console.log("[POST] Updated row:", data[0]);

      // Refresh alle data om nieuwe blokData terug te sturen
      const refresh = await supabase
        .from("time_slots")
        .select("*")
        .order("blok", { ascending: true })
        .order("slot_index", { ascending: true });

      if (refresh.error) {
        console.error("[POST] Refresh error:", refresh.error);
        return { statusCode: 500, body: "Refresh error: " + refresh.error.message };
      }

      let blokData = {};
      for (let row of refresh.data) {
        const blok = row.blok;
        if (!blokData[blok]) {
          blokData[blok] = {
            date: row.date_str || "",
            timeslots: [],
            selected: []
          };
        }
        blokData[blok].timeslots.push(row.slot_label);
        blokData[blok].selected.push(row.is_selected);
      }

      console.log("[POST] Updated blokData after reservation");
      return {
        statusCode: 200,
        body: JSON.stringify(blokData)
      };

    } catch (err) {
      console.error("[POST] Unexpected error:", err);
      return { statusCode: 500, body: "Unexpected POST error: " + err.message };
    }
  }

  // Andere HTTP-methods niet toegestaan
  return { statusCode: 405, body: "Method Not Allowed" };
};
