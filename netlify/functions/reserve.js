// netlify/functions/reserve.js

"use strict";
const faunadb = require("faunadb");
const q = faunadb.query;

exports.handler = async (event, context) => {
  // 1) Maak een Fauna-client met de secret uit je Netlify environment
  const client = new faunadb.Client({
    secret: process.env.FAUNA_SECRET
  });

  // 2) Verwijs naar jouw document in Fauna:
  //    - Collection heet "Reservatie"
  //    - Document ID hier op "slots" gezet (pas dit aan naar jouw werkelijke ID)
  const docRef = q.Ref(q.Collection("Reservatie"), "420993793829896400");

  // 3) Log het event.httpMethod en evt. queryparams voor debugging
  console.log("[RESERVE] HTTP method:", event.httpMethod);
  console.log("[RESERVE] Query params:", event.queryStringParameters);

  // 4) GET: ?mode=get => haal doc op
  if (event.httpMethod === "GET") {
    const mode = event.queryStringParameters.mode || "";
    if (mode === "get") {
      try {
        console.log("[GET] Attempting to fetch docRef:", docRef);

        const doc = await client.query(q.Get(docRef));
        console.log("[GET] Fetched doc data:", doc.data);

        return {
          statusCode: 200,
          body: JSON.stringify(doc.data)
        };
      } catch (err) {
        // Log de volledige error
        console.error("[GET] Error while fetching doc:", err);
        return { statusCode: 500, body: "Fauna get error: " + err.message };
      }
    }
    // Als geen mode=get
    return { statusCode: 400, body: "Unknown GET mode" };
  }

  // 5) POST: tijdslot reserveren
  if (event.httpMethod === "POST") {
    try {
      // Lees JSON-body { blok, index }
      const body = JSON.parse(event.body);
      console.log("[POST] Received body:", body);

      // (A) Huidige data ophalen
      const doc = await client.query(q.Get(docRef));
      console.log("[POST] Current doc data:", doc.data);

      let blokData = doc.data;
      // (B) Check concurrency
      if (blokData[body.blok].selected[body.index] === true) {
        console.warn(`[POST] Slot ${body.index} in ${body.blok} is already true`);
        return { statusCode: 409, body: "Slot already taken" };
      }

      // (C) Markeer slot
      blokData[body.blok].selected[body.index] = true;
      console.log("[POST] Marking slot as taken for:", body.blok, body.index);

      // (D) Update doc in Fauna
      const updated = await client.query(
        q.Update(docRef, { data: blokData })
      );
      console.log("[POST] Update success, new doc data:", updated.data);

      // Return de nieuwe data
      return {
        statusCode: 200,
        body: JSON.stringify(updated.data)
      };

    } catch (err) {
      console.error("[POST] Fauna update error:", err);
      return { statusCode: 500, body: "Fauna error: " + err.message };
    }
  }

  // 6) Andere method => niet toegestaan
  return { statusCode: 405, body: "Method Not Allowed" };
};
