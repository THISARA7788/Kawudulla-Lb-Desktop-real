const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

async function checkAndClean() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const UserCounter = mongoose.model('UserCounter');

    // Find users where name or grade contains instruction text
    const invalidUsers = await User.find({
      $or: [
        { name: { $regex: /optional|instruction|system generates|required field/i } },
        { grade: { $regex: /optional|instruction|system generates|required field/i } },
        { class: { $regex: /optional|instruction|system generates|required field/i } },
        { name: 'ytrh' }, // test record if test string
      ]
    }).lean();

    console.log(`Found ${invalidUsers.length} invalid/test users created during import test:`);
    invalidUsers.forEach((u) => {
      console.log(`- [${u.memberId}] Name: "${u.name}" | Grade: "${u.grade}"`);
    });

    if (invalidUsers.length > 0) {
      const ids = invalidUsers.map((u) => u._id);
      await User.deleteMany({ _id: { $in: ids } });
      console.log(`Deleted ${invalidUsers.length} invalid test records.`);
    }

    // Now re-calculate max student seq
    const students = await User.find({ role: 'student', memberId: { $regex: /^KMV-\d+$/ } }).lean();
    let maxStudentSeq = 0;
    students.forEach((s) => {
      const num = parseInt(s.memberId.replace('KMV-', ''), 10);
      if (!isNaN(num) && num > maxStudentSeq) maxStudentSeq = num;
    });

    const teachers = await User.find({ role: 'teacher', memberId: { $regex: /^KMV-T\d+$/ } }).lean();
    let maxTeacherSeq = 0;
    teachers.forEach((t) => {
      const num = parseInt(t.memberId.replace('KMV-T', ''), 10);
      if (!isNaN(num) && num > maxTeacherSeq) maxTeacherSeq = num;
    });

    await UserCounter.findByIdAndUpdate('memberId', { $set: { seq: maxStudentSeq } }, { upsert: true });
    await UserCounter.findByIdAndUpdate('teacherMemberId', { $set: { seq: maxTeacherSeq } }, { upsert: true });

    console.log(`\nCounters successfully synced:`);
    console.log(`- Student counter: ${maxStudentSeq} (Next student: KMV-${String(maxStudentSeq + 1).padStart(4, '0')})`);
    console.log(`- Teacher counter: ${maxTeacherSeq} (Next teacher: KMV-T${String(maxTeacherSeq + 1).padStart(3, '0')})`);

    process.exit(0);
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
}

checkAndClean();
