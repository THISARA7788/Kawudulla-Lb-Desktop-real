const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

const GRADE_ORDER = {
  'Grade 1': 1,
  'Grade 2': 2,
  'Grade 3': 3,
  'Grade 4': 4,
  'Grade 5': 5,
  'Grade 6': 6,
  'Grade 7': 7,
  'Grade 8': 8,
  'Grade 9': 9,
  'Grade 10': 10,
  'Grade 11': 11,
  'Grade 12': 12,
  'Grade 13': 13,
};

async function reorganizeMembers() {
  try {
    console.log('Connecting to MongoDB at:', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully.\n');

    const UserCounter = mongoose.model('UserCounter');

    // Fetch all users
    const allUsers = await User.find({}).lean();
    console.log(`Found ${allUsers.length} total users.`);

    // 1. Give temporary IDs first to prevent any unique constraint conflicts
    console.log('Assigning temporary IDs...');
    for (let i = 0; i < allUsers.length; i++) {
      await User.updateOne({ _id: allUsers[i]._id }, { $set: { memberId: `TEMP-${Date.now()}-${i}` } });
    }

    // 2. Separate into Librarian, Teachers, Students
    const librarians = allUsers.filter((u) => u.role === 'librarian');
    const teachers = allUsers.filter((u) => u.role === 'teacher');
    const students = allUsers.filter((u) => u.role === 'student');

    // Sort Teachers by Name
    teachers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Sort Students by Grade Order, Class/Section, then Name
    students.sort((a, b) => {
      const gA = GRADE_ORDER[a.grade] || 99;
      const gB = GRADE_ORDER[b.grade] || 99;
      if (gA !== gB) return gA - gB;

      const cA = a.class || '';
      const cB = b.class || '';
      if (cA !== cB) return cA.localeCompare(cB);

      return (a.name || '').localeCompare(b.name || '');
    });

    console.log('\nAssigning permanent sequential Member IDs...');

    // 3. Update Librarian (Remove memberId completely)
    for (const lib of librarians) {
      await User.updateOne({ _id: lib._id }, { $unset: { memberId: 1 }, $set: { grade: '' } });
      console.log(`[LIBRARIAN] ${lib.name} ➔ Removed memberId (Admin Only)`);
    }

    // 4. Update Teachers (KMV-T001 to KMV-T013)
    let teacherSeq = 0;
    for (const teacher of teachers) {
      teacherSeq++;
      const newId = `KMV-T${String(teacherSeq).padStart(3, '0')}`;
      await User.updateOne({ _id: teacher._id }, { $set: { memberId: newId, grade: 'Teacher' } });
      console.log(`[TEACHER ${teacherSeq}] ${teacher.name} ➔ ${newId}`);
    }

    // 5. Update Students (KMV-0001 to KMV-0037)
    let studentSeq = 0;
    for (const student of students) {
      studentSeq++;
      const newId = `KMV-${String(studentSeq).padStart(4, '0')}`;
      await User.updateOne({ _id: student._id }, { $set: { memberId: newId } });
      console.log(`[STUDENT ${studentSeq}] ${student.name} (${student.grade} - ${student.class || 'N/A'}) ➔ ${newId}`);
    }

    // 6. Update User Counters
    await UserCounter.findByIdAndUpdate(
      'memberId',
      { $set: { seq: studentSeq } },
      { upsert: true }
    );

    await UserCounter.findByIdAndUpdate(
      'teacherMemberId',
      { $set: { seq: teacherSeq } },
      { upsert: true }
    );

    console.log(`\nCounters successfully set:`);
    console.log(` - Student counter (memberId): ${studentSeq} (Next new student will be KMV-${String(studentSeq + 1).padStart(4, '0')})`);
    console.log(` - Teacher counter (teacherMemberId): ${teacherSeq} (Next new teacher will be KMV-T${String(teacherSeq + 1).padStart(3, '0')})`);

    console.log('\nAll members reorganized successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error reorganizing members:', err);
    process.exit(1);
  }
}

reorganizeMembers();
