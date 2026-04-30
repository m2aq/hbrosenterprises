export const ActivityIds = [
  "hose_removal",
  "roll_hose",
  "pull_wire_down",
  "roll_wire",
  "cutting_post_wire",
  "post_removal",
  "plant_removal",
  "cleaning"
];

export function isValidActivityId(value) {
  return ActivityIds.includes(value);
}
