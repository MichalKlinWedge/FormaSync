// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_init.sql';
import m0001 from './0001_session_exercises.sql';
import m0002 from './0002_session_title.sql';
import m0003 from './0003_archived_activities.sql';
import m0004 from './0004_sport.sql';
import m0005 from './0005_segments.sql';
import m0006 from './0006_plan_garmin_workout.sql';
import m0007 from './0007_body_pressure.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007
    }
  }
  