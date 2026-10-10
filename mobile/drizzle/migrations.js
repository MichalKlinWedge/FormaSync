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
import m0008 from './0008_segment_stroke.sql';
import m0009 from './0009_swim_equipment.sql';
import m0010 from './0010_swim_template_strokes.sql';
import m0011 from './0011_seeded_templates.sql';
import m0012 from './0012_exercise_video.sql';
import m0013 from './0013_term_plan_title.sql';
import m0014 from './0014_hydration.sql';
import m0015 from './0015_training_goals.sql';
import m0016 from './0016_garmin_records.sql';

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
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016
    }
  }
  