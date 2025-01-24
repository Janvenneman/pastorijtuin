"use strict";

const { createClient } = require("@supabase/supabase-js");

// Netlify handler
exports.handler = async (event, context) => {
  console.log("[SUPABASE RESERVE] Method:", event.httpMethod);

  // 1) Maak de Supabase client aan met server credentials
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2) Routes
  if (event.httpMethod === "GET") {
    const mode = event.queryStringParameters.mode || "";
    if (mode === "get") {
      // Haal alle slots op
      try {
        console.log("[GET] Fetching all time_slots...");
        let { data, error } = await supabase
          .from("time_slots")
          .select("*");

        if (error) {
          console.error("[GET] Supabase error:", error);
          return { statusCode: 500, body: "Supabase get error: " + error.message };
        }

        // data is een array van rows: [
        //   { id, blok, date_str, slot, is_selected },
        //   ...
        // ]
        console.log("[GET] Received rows:", data.length);
        return {
          statusCode: 200,
          body: JSON.stringify(data)
        };
      } catch (err) {
        console.error("[GET] Unexpected error:", err);
        return { statusCode: 500, body: "Unexpected get error: " + err.message };
      }
    }
    return { statusCode: 400, body: "Unknown GET mode" };
  }

  if (event.httpMethod === "POST") {
    try {
      // Client stuurt body { blok, slot } of { blok, index }, hoe je wilt
      const body = JSON.parse(event.body);
      console.log("[POST] Body:", body);

      const blok = body.blok;
      const slot = body.slot; 
      // OF als je met "index" werkt, moet je iets anders doen. 
      // Supabase is row-based, dus we zoeken row via (blok, slot)...

      // 3) Concurrency-check via "update... where is_selected = false"
      // We updaten EXACT 1 row matching (blok, slot) en is_selected=false
      const { data, error, count } = await supabase
        .from("time_slots")
        .update({ is_selected: true })
        .eq("blok", blok)
        .eq("slot", slot)
        .eq("is_selected", false)     // concurrency
        .select("*", { count: "exact" });

      if (error) {
        console.error("[POST] Supabase update error:", error);
        return { statusCode: 500, body: "Supabase update error: " + error.message };
      }

      if (data.length === 0) {
        // Betekent dat er geen row is geüpdatet => slot was al true of bestaat niet
        console.warn("[POST] Conflict, slot already taken or not found");
        return { statusCode: 409, body: "Slot is already taken" };
      }

      // Succes
      console.log("[POST] Update success. Updated row(s):", data.length);
      return {
        statusCode: 200,
        body: JSON.stringify({ updated: data[0] })
      };

    } catch (err) {
      console.error("[POST] Unexpected error:", err);
      return { statusCode: 500, body: "Unexpected post error: " + err.message };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
