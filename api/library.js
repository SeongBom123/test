import LIBRARY from "../lib/library.js";
import { send } from "../lib/http.js";

export default function handler(req, res) {
  send(res, 200, { items: LIBRARY });
}
