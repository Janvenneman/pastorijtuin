const faunadb = require('faunadb');
const q = faunadb.query;

exports.handler = async (event, context) => {
  const client = new faunadb.Client({
    secret: process.env.FAUNA_SECRET
  });

  // Vervang "Reservatie" door jouw collectie-naam
  // Vervang "420970567742521552" door jouw Fauna-document ID
  const docRef = q.Ref(q.Collection("Reservatie"), "420993793829896400");

  if (event.httpMethod === "GET") {
    const mode = event.queryStringParameters.mode || "";
    if (mode === "get") {
      try {
        const doc = await client.query(q.Get(docRef));
        return {
          statusCode: 200,
          body: JSON.stringify(doc.data)
        };
      } catch (err) {
        return { statusCode: 500, body: "Fout bij GET doc: " + err.message };
      }
    }
    return { statusCode: 400, body: "Onbekende GET-mode" };
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      const blok = body.blok;
      const index = body.index;

      // 1) Lees huidige data
      const doc = await client.query(q.Get(docRef));
      let blokData = doc.data;

      // 2) Check concurrency
      if (blokData[blok].selected[index] === true) {
        return { statusCode: 409, body: "Slot already taken" };
      }

      // 3) Markeer slot
      blokData[blok].selected[index] = true;

      // 4) Update
      const updated = await client.query(
        q.Update(docRef, { data: blokData })
      );

      return {
        statusCode: 200,
        body: JSON.stringify(updated.data)
      };
    } catch (err) {
      return { statusCode: 500, body: "Fout bij POST doc: " + err.message };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
