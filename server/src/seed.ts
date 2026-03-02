import { initDatabase, getDb, run, all, get } from './database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const seedDatabase = async () => {
  console.log('Starting database seed...');
  // Run migrations to ensure schema is up to date before seeding
  await initDatabase();
  const db = getDb();

  // Clear existing data (except admin user)
  await run(db, 'DELETE FROM student_lessons');
  await run(db, 'DELETE FROM student_consents');
  await run(db, 'DELETE FROM sessions');
  await run(db, 'DELETE FROM tutor_notes');
  await run(db, 'DELETE FROM progress');
  await run(db, 'DELETE FROM lessons');
  await run(db, 'DELETE FROM games');
  await run(db, 'DELETE FROM students');
  await run(db, 'DELETE FROM users WHERE id != ?', ['admin-001']);
  await run(db, 'DELETE FROM schools');

  // Create demo school
  const schoolId = uuidv4();
  await run(db,
    'INSERT INTO schools (id, name, address, contact_email, contact_phone, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [schoolId, 'Riverside Digital Literacy Centre', '123 Education Way, Johannesburg', 'contact@riverside-demo.school', '+27 11 123 4567', 'admin-001']
  );

  // Create additional users
  const teacherId = uuidv4();
  const parent1Id = uuidv4();
  const parent2Id = uuidv4();
  const parent3Id = uuidv4();
  const parent4Id = uuidv4();
  const parent5Id = uuidv4();
  const parent6Id = uuidv4();

  const teacherPassword = await bcrypt.hash('teacher123', 10);
  const parentPassword = await bcrypt.hash('parent123', 10);

  await run(db,
    'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
    [teacherId, 'teacher@lms.com', teacherPassword, 'Ms. Sarah Johnson', 'teacher']
  );
  await run(db, 'UPDATE users SET school_id = ? WHERE id = ?', [schoolId, teacherId]);

  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent1Id, 'parent1@lms.com', parentPassword, 'David Mthembu', 'parent', schoolId]
  );
  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent2Id, 'parent2@lms.com', parentPassword, 'Nomsa Dlamini', 'parent', schoolId]
  );
  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent3Id, 'parent3@lms.com', parentPassword, 'Thabo Nkosi', 'parent', schoolId]
  );
  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent4Id, 'parent4@lms.com', parentPassword, 'Lindiwe Zulu', 'parent', schoolId]
  );
  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent5Id, 'parent5@lms.com', parentPassword, 'Justice Khumalo', 'parent', schoolId]
  );
  await run(db,
    'INSERT INTO users (id, email, password, name, role, school_id) VALUES (?, ?, ?, ?, ?, ?)',
    [parent6Id, 'parent6@lms.com', parentPassword, 'Patience Molefe', 'parent', schoolId]
  );

  // Create students — one per grade (4–9), each with a unique name and parent
  const demoLearnerPin = '1234';
  const demoLearnerPinHash = await bcrypt.hash(demoLearnerPin, 10);
  const students = [
    { id: uuidv4(), name: 'Mpho Sithole',   grade: 4, age: 10, parent_id: parent1Id, email: 'mpho.sithole@student.lms'   },
    { id: uuidv4(), name: 'Lerato Dlamini', grade: 5, age: 11, parent_id: parent2Id, email: 'lerato.dlamini@student.lms' },
    { id: uuidv4(), name: 'Sipho Nkosi',    grade: 6, age: 12, parent_id: parent3Id, email: 'sipho.nkosi@student.lms'    },
    { id: uuidv4(), name: 'Zanele Zulu',    grade: 7, age: 13, parent_id: parent4Id, email: 'zanele.zulu@student.lms'    },
    { id: uuidv4(), name: 'Bongani Khumalo',grade: 8, age: 14, parent_id: parent5Id, email: 'bongani.khumalo@student.lms'},
    { id: uuidv4(), name: 'Amahle Molefe',  grade: 9, age: 15, parent_id: parent6Id, email: 'amahle.molefe@student.lms'  },
  ];

  for (const student of students) {
    await run(db,
      `INSERT INTO students (id, name, email, grade, age, school_id, tutor_id, teacher_id, parent_id, learner_pin_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [student.id, student.name, student.email, student.grade, student.age, schoolId, 'admin-001', teacherId, student.parent_id, demoLearnerPinHash]
    );
  }

  // Create games — one per category
  const games = [
    {
      id: uuidv4(),
      title: 'Code Quest: Pattern Recognition',
      category: 'computational_thinking',
      difficulty: 1,
      description: 'Identify patterns and sequences to solve puzzles. Develops logical thinking and problem-solving skills.',
      instructions: 'Look for what repeats, what changes, and what comes next. Pause before answering so you can explain the pattern to yourself.',
    },
    {
      id: uuidv4(),
      title: 'Typing Tutor: Home Row Basics',
      category: 'typing',
      difficulty: 1,
      description: 'Master the home row keys with guided practice. Build muscle memory for efficient typing.',
      instructions: 'Sit tall, keep your fingers on the home row, and type carefully. Accuracy matters more than speed when you are learning.',
    },
    {
      id: uuidv4(),
      title: 'Digital Citizenship Quest',
      category: 'purposeful_gaming',
      difficulty: 1,
      description: 'Learn online safety and digital etiquette through interactive scenarios. Build responsible digital habits.',
      instructions: 'Choose the action that is safe, respectful, and responsible. Think about how your choices affect you and other people online.',
    },
  ];

  for (const game of games) {
    await run(db,
      'INSERT INTO games (id, title, description, category, difficulty_level, instructions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [game.id, game.title, game.description, game.category, game.difficulty, game.instructions, 'admin-001']
    );
  }

  // Create lessons — one lesson using all three games
  const lesson1Id = uuidv4();
  const lesson1ContentJson = JSON.stringify({
    overview:
      'This lesson introduces the habits strong digital learners use every day: spotting patterns, typing with control, and making safe choices online. Work through each station slowly and focus on accuracy before speed.',
    heroImageUrl:
      'https://cdn.prod.website-files.com/591515887c47180f72a5c58e/6917b1fe38adeeaab790f12e_2025_11_18_China%27s%20massive%20overseas%20portfolio.png',
    heroImageAlt: 'Digital learning and global connection illustration',
    storyCards: [
      {
        title: 'Why digital literacy matters',
        body: 'Digital skills help learners think critically, communicate clearly, and participate confidently in modern learning spaces.',
        imageUrl:
          'https://cdn.prod.website-files.com/591515887c47180f72a5c58e/6917b1fe38adeeaab790f12e_2025_11_18_China%27s%20massive%20overseas%20portfolio.png',
        imageAlt: 'Learners working with digital tools',
        linkLabel: 'Explore digital skills',
        linkUrl: 'https://www.unicef.org/globalinsight/reports/digital-literacy',
      },
      {
        title: 'Safe and responsible online behavior',
        body: 'Learners should know how to protect personal information, identify risky situations, and treat others respectfully online.',
        imageUrl:
          'https://cdn.prod.website-files.com/591515887c47180f72a5c58e/6904fe14f720c47427280886_2025_10_31_How%20Beijing%20is%20adapting%20BRI.png',
        imageAlt: 'Safe online behavior concept image',
        linkLabel: 'Online safety basics',
        linkUrl: 'https://www.commonsense.org/education/digital-citizenship',
      },
      {
        title: 'Learning through practice',
        body: 'This lesson combines problem-solving, typing practice, and digital citizenship so learners build confidence across core skills.',
        imageUrl:
          'https://cdn.prod.website-files.com/591515887c47180f72a5c58e/68f15ae5d8abfdc02421a3b9_2025_10_16_New%20in-depth%20profiles.png',
        imageAlt: 'Learning progress and milestones',
        linkLabel: '',
        linkUrl: '',
      },
    ],
    goals: [
      'Notice patterns and make smart predictions before answering.',
      'Practice home-row typing habits with calm, accurate finger movement.',
      'Recognize safe, respectful choices when using digital spaces.',
    ],
    checklist: [
      'Read the challenge before you click or type.',
      'Keep your hands steady and try again if you make a mistake.',
      'Finish all three stations to complete the lesson path.',
    ],
    stationGuidance: [
      'Use clues, patterns, and logic to solve each mission in Sector 7. Explain your thinking to yourself before choosing an answer.',
      'In Cyber Strike, focus on finger placement and rhythm. Accuracy first, then build your speed as you grow more confident.',
      'Citizen Quest asks you to think about how people should act online. Choose the option that is safe, kind, and responsible.',
    ],
  });

  await run(db,
    'INSERT INTO lessons (id, title, description, thumbnail_url, lesson_content_json, station_1_game_id, station_2_game_id, station_3_game_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      lesson1Id,
      'Introduction to Digital Literacy',
      'A comprehensive introduction to computational thinking, typing fundamentals, and digital citizenship. Perfect for beginners starting their digital literacy journey.',
      '/lesson-thumbnails/introduction_to_digital_literacy.png',
      lesson1ContentJson,
      games[0].id, games[1].id, games[2].id, 'admin-001'
    ]
  );

  // Create progress data
  const progressEntries = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];

    for (let j = 0; j < games.length; j++) {
      const game = games[j];
      const stationNumber = j + 1;
      const completed = Math.random() > 0.3;
      const score = completed ? Math.floor(Math.random() * 30) + 70 : Math.floor(Math.random() * 50) + 20;
      const attempts = completed ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 2) + 1;
      const timeSpent = Math.floor(Math.random() * 600) + 120;

      progressEntries.push({
        student_id: student.id,
        game_id: game.id,
        lesson_id: lesson1Id,
        station_number: stationNumber,
        score,
        completed: completed ? 1 : 0,
        attempts,
        time_spent: timeSpent
      });
    }
  }

  // Assign lesson to all students
  for (const student of students) {
    const slId = uuidv4();
    await run(db,
      'INSERT INTO student_lessons (id, student_id, lesson_id, assigned_by) VALUES (?, ?, ?, ?)',
      [slId, student.id, lesson1Id, 'admin-001']
    );
  }

  // Create sessions — 2 past (completed) + 1 upcoming per student
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  for (const student of students) {
    // Past session 1 — 14 days ago
    const s1Id = uuidv4();
    const s1Date = fmt(addDays(today, -14));
    await run(db,
      `INSERT INTO sessions (id, student_id, tutor_id, lesson_id, title, session_date, start_time, end_time, status, notes, parent_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 1)`,
      [s1Id, student.id, 'admin-001', lesson1Id, 'Session 1 — Introduction', s1Date, '09:00', '10:00',
       'Good first session. Student engaged well with the pattern recognition game.']
    );
    await run(db,
      'INSERT INTO tutor_notes (id, student_id, tutor_id, session_id, note, session_date) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), student.id, 'admin-001', s1Id,
       `${student.name.split(' ')[0]} showed good enthusiasm. Typing speed is improving — aim for 25 wpm next session.`,
       s1Date]
    );

    // Past session 2 — 7 days ago
    const s2Id = uuidv4();
    const s2Date = fmt(addDays(today, -7));
    await run(db,
      `INSERT INTO sessions (id, student_id, tutor_id, lesson_id, title, session_date, start_time, end_time, status, notes, parent_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 1)`,
      [s2Id, student.id, 'admin-001', lesson1Id, 'Session 2 — Typing Focus', s2Date, '09:00', '10:00',
       'Focused on home row keys. Strong improvement in accuracy.']
    );
    await run(db,
      'INSERT INTO tutor_notes (id, student_id, tutor_id, session_id, note, session_date) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), student.id, 'admin-001', s2Id,
       `Accuracy up to 92%. ${student.name.split(' ')[0]} completed all three stations. Ready to move to next lesson when available.`,
       s2Date]
    );

    // Upcoming session — 7 days from now
    const s3Date = fmt(addDays(today, 7));
    await run(db,
      `INSERT INTO sessions (id, student_id, tutor_id, lesson_id, title, session_date, start_time, end_time, status, parent_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 0)`,
      [uuidv4(), student.id, 'admin-001', lesson1Id, 'Session 3 — Digital Citizenship', s3Date, '09:00', '10:00']
    );
  }

  for (const entry of progressEntries) {
    const id = uuidv4();
    await run(db,
      'INSERT INTO progress (id, student_id, game_id, lesson_id, station_number, score, completed, attempts, time_spent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, entry.student_id, entry.game_id, entry.lesson_id, entry.station_number, entry.score, entry.completed, entry.attempts, entry.time_spent]
    );
  }

  console.log(`Seeded database with:
  - 1 school (Riverside Digital Literacy Centre)
  - ${students.length} students
  - learner demo PIN: ${demoLearnerPin}
  - ${games.length} games (1 per category)
  - 1 lesson
  - ${progressEntries.length} progress entries
  - 1 teacher (linked to school)
  - 3 parents`);
};

// Run seed if called directly
if (require.main === module) {
  initDatabase().then(() => {
    seedDatabase().then(() => {
      console.log('Database seeding completed!');
      process.exit(0);
    }).catch(err => {
      console.error('Error seeding database:', err);
      process.exit(1);
    });
  });
}

export default seedDatabase;
