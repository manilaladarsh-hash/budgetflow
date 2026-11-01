// Run every unit test in the user's time zone so local-day logic is exercised
// across a non-UTC offset.
process.env.TZ = 'America/Toronto';
