import { send } from "../lib/http.js";

/** 어떤 기능이 켜져 있는지만 알려 준다. 키 값은 절대 포함하지 않는다. */
export default function handler(req, res) {
  send(res, 200, {
    reviewEnabled: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE),
    liveEnabled: Boolean(process.env.LAW_OC && process.env.ACCESS_CODE),
  });
}
