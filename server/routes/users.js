const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { protect, authorize } = require('../middleware/auth');

const inMemoryStorage = multer.memoryStorage();
const uploadFile = multer({ storage: inMemoryStorage });

const parseCSVText = (csvText) => {
  const parsedRows = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++; // skip double quote escape
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      parsedRows.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    parsedRows.push(row);
  }
  return parsedRows;
};

const getCellValueText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'object') {
    if (cell.value.text) return String(cell.value.text);
    if (cell.value.hyperlink) return String(cell.value.text || cell.value.hyperlink.replace(/^mailto:/i, ''));
    if (cell.value.result !== undefined) return String(cell.value.result);
    if (cell.value.richText && Array.isArray(cell.value.richText)) {
      return cell.value.richText.map((t) => t.text || '').join('');
    }
    return '';
  }
  return String(cell.value).trim();
};

/**
 * =============================================
 * USER MANAGEMENT ROUTES (Librarian Only)
 * =============================================
 * All routes below: GET/PUT/DELETE /api/users/...
 */

// GET /api/users/template - Download official formatted Excel template for bulk member/student import
router.get('/template', protect, authorize('librarian'), async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Kawudulla Central College Library';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Students & Members', {
      views: [{ showGridLines: true }]
    });

    // Define Header Columns
    worksheet.columns = [
      { header: 'Admission / Member ID', key: 'memberId', width: 22 },
      { header: 'Full Name *', key: 'name', width: 30 },
      { header: 'Grade *', key: 'grade', width: 16 },
      { header: 'Class / Section', key: 'class', width: 22 },
      { header: 'Role (student/teacher)', key: 'role', width: 22 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9E0D0D' }, // Maroon Theme
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    // Add Sample Rows
    const sampleData = [
      { memberId: 'KMV-0001', name: 'Kasun Chamara', grade: 'Grade 6', class: 'A', role: 'student' },
      { memberId: 'KMV-0002', name: 'Nethmi Dilrukshi', grade: 'Grade 6', class: 'B', role: 'student' },
      { memberId: 'KMV-0003', name: 'Sahan Sandeepa', grade: 'Grade 10', class: 'A', role: 'student' },
      { memberId: 'KMV-0004', name: 'Dilani Kumari', grade: 'Grade 12', class: 'Physical Science', role: 'student' },
      { memberId: 'KMV-T001', name: 'Mrs. Jayasinghe', grade: '', class: '', role: 'teacher' },
    ];

    sampleData.forEach((item) => {
      const row = worksheet.addRow(item);
      row.alignment = { vertical: 'middle' };
    });

    // Add Information Note at the bottom
    worksheet.addRow({});
    const noteRow1 = worksheet.addRow(['📌 INSTRUCTIONS:']);
    noteRow1.font = { bold: true, color: { argb: 'FF9E0D0D' } };
    worksheet.addRow(['1. Full Name and Grade are required for students. For teachers, leave Grade blank.']);
    worksheet.addRow(['2. For Grades 1-11, enter Section as A, B, C, D, etc. For Grades 12-13, enter stream (e.g. Physical Science, Bio Science, Commerce, Arts, Technology).']);
    worksheet.addRow(['3. Admission/Member ID is optional. If left blank, system generates KMV-0001, KMV-0002... for students and KMV-T001, KMV-T002... for teachers.']);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Kawudulla_Student_Import_Template.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({ message: 'Failed to generate Excel template.' });
  }
});

// POST /api/users/import - Bulk import members via Excel file or CSV (Streamlined for School)
router.post('/import', protect, authorize('librarian'), uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel (.xlsx, .xls) or CSV file.' });
    }

    const defaultPassword = (req.body.defaultPassword && req.body.defaultPassword.trim().length >= 6)
      ? req.body.defaultPassword.trim()
      : 'Kmv@1234';

    let rawRows = [];
    const originalName = (req.file.originalname || '').toLowerCase();

    if (originalName.endsWith('.csv')) {
      const csvContent = req.file.buffer.toString('utf-8');
      rawRows = parseCSVText(csvContent);
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ message: 'The uploaded Excel workbook contains no readable sheets.' });
      }

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const rowValues = [];
        const maxCols = Math.max(worksheet.columnCount || 0, row.cellCount || 0, 15);
        for (let col = 1; col <= maxCols; col++) {
          const cell = row.getCell(col);
          rowValues.push(getCellValueText(cell));
        }
        rawRows.push(rowValues);
      });
    }

    if (rawRows.length < 2) {
      return res.status(400).json({ message: 'Uploaded file has no data rows.' });
    }

    // Dynamic header row detection - must match multiple column headers and NOT be an instruction line
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
      const rowStrings = (rawRows[r] || []).map((c) => (c || '').toString().trim().toLowerCase());
      const hasName = rowStrings.some((s) => s === 'name' || s === 'full name' || s === 'full name *' || s === 'student name' || s === 'member name');
      const hasOtherHeaders = rowStrings.some((s) => s.includes('grade') || s.includes('role') || s.includes('admission') || s.includes('member id') || s.includes('section'));
      const isInstruction = rowStrings.some((s) => s.startsWith('1.') || s.startsWith('2.') || s.startsWith('3.') || s.startsWith('4.') || s.includes('instruction') || s.includes('📌'));

      if (hasName && hasOtherHeaders && !isInstruction) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      // Fallback: search for first row with at least 3 non-empty cells where one is name
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const rowStrings = (rawRows[r] || []).map((c) => (c || '').toString().trim().toLowerCase());
        const hasName = rowStrings.some((s) => s.includes('name'));
        const isInstruction = rowStrings.some((s) => s.startsWith('1.') || s.startsWith('2.') || s.startsWith('3.') || s.includes('instruction') || s.includes('📌'));
        if (hasName && !isInstruction) {
          headerRowIdx = r;
          break;
        }
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0;
    }

    const headers = rawRows[headerRowIdx].map(h => (h || '').toString().trim().toLowerCase());
    
    // Map headers to field indices
    const findIndex = (aliases) => headers.findIndex(h => aliases.some(alias => h.includes(alias)));
    
    const nameIdx = findIndex(['full name', 'student name', 'member name', 'namaya', 'name']);
    const emailIdx = findIndex(['email', 'email address', 'mail']);
    const roleIdx = findIndex(['role', 'member role', 'type']);
    const gradeIdx = findIndex(['grade', 'class grade', 'year', 'shreniya']);
    const classIdx = findIndex(['class', 'section', 'stream', 'a/l stream', 'panthiya']);
    const memberIdIdx = findIndex(['admission', 'member id', 'memberid', 'index', 'admission no', 'index no', 'id']);
    const phoneIdx = findIndex(['phone', 'contact', 'mobile', 'tel', 'tele', 'contact no', 'phone no', 'durakathana']);
    const passwordIdx = findIndex(['password', 'pass']);

    if (nameIdx === -1) {
      return res.status(400).json({
        message: 'Invalid column headers. Template must contain at least a "Full Name" column.'
      });
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const importedUsers = [];
    const timestampSeed = Date.now();

    // Process each row
    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0 || row.every(cell => !cell || !cell.toString().trim())) {
        continue;
      }

      const name = row[nameIdx] ? row[nameIdx].toString().trim() : '';
      let email = emailIdx !== -1 && row[emailIdx] ? row[emailIdx].toString().trim().toLowerCase() : '';
      const rawRole = roleIdx !== -1 && row[roleIdx] ? row[roleIdx].toString().trim().toLowerCase() : 'student';
      const role = (rawRole === 'teacher' || rawRole === 'staff') ? 'teacher' : 'student';
      
      let grade = gradeIdx !== -1 && row[gradeIdx] ? row[gradeIdx].toString().trim() : (role === 'teacher' ? 'Teacher' : '');
      const classVal = classIdx !== -1 && row[classIdx] ? row[classIdx].toString().trim() : '';
      const customMemberId = memberIdIdx !== -1 && row[memberIdIdx] ? row[memberIdIdx].toString().trim() : '';
      const phone = phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx].toString().trim() : '';
      const rowPassword = passwordIdx !== -1 && row[passwordIdx] && row[passwordIdx].toString().trim().length >= 6
        ? row[passwordIdx].toString().trim()
        : 'Kmv@1234';

      // Skip instruction/note rows (like "📌 INSTRUCTIONS: ...", "1. Full Name...", "3. Admission/Member ID...")
      const isInstructionRow =
        name.includes('NOTE:') ||
        name.includes('📌') ||
        name.includes('INSTRUCTIONS') ||
        /^\d+\.\s+/.test(name) ||
        name.toLowerCase().includes('required field') ||
        name.toLowerCase().includes('system generates') ||
        name.toLowerCase().includes('admission/member id is optional') ||
        (grade && (/^\d+\.\s+/.test(grade) || grade.toLowerCase().includes('instruction') || grade.toLowerCase().includes('system generates')));

      if (isInstructionRow) {
        continue;
      }

      if (!name) {
        skippedCount++;
        errors.push(`Row ${r + 1}: Name is required.`);
        continue;
      }

      // Standardize grade format (e.g. "6" or "Grade 6" -> "Grade 6")
      if (grade && /^\d+$/.test(grade)) {
        grade = `Grade ${grade}`;
      }

      // If email is absent, auto-generate school-standard email
      if (!email) {
        const cleanNamePart = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
        const cleanIdPart = customMemberId ? customMemberId.toLowerCase().replace(/[^a-z0-9]/g, '') : `${timestampSeed % 10000}${r}`;
        email = `student.${cleanNamePart || 'user'}.${cleanIdPart}@kmv.edu`;
      }

      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(email)) {
        skippedCount++;
        errors.push(`Row ${r + 1} (${name}): Invalid email format "${email}".`);
        continue;
      }

      // Check if user already exists
      const existing = await User.findOne({ email });
      if (existing) {
        if (existing.status === 'rejected') {
          await User.deleteOne({ _id: existing._id });
        } else {
          skippedCount++;
          errors.push(`Row ${r + 1} (${name}): Email "${email}" already exists.`);
          continue;
        }
      }

      // If custom member ID provided, check uniqueness
      if (customMemberId) {
        const idExists = await User.findOne({ memberId: customMemberId });
        if (idExists) {
          skippedCount++;
          errors.push(`Row ${r + 1} (${name}): Member ID "${customMemberId}" is already in use.`);
          continue;
        }
      }

      try {
        const newUserData = {
          name,
          email,
          phone: phone || '',
          password: rowPassword,
          role,
          grade: role === 'teacher' ? 'Teacher' : (grade || 'Grade 6'),
          class: role === 'teacher' ? '' : classVal,
          status: 'active', // Direct librarian import activates immediately
        };

        if (customMemberId) {
          newUserData.memberId = customMemberId;
        }

        const createdUser = await User.create(newUserData);
        importedUsers.push({
          _id: createdUser._id,
          memberId: createdUser.memberId,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone,
          role: createdUser.role,
          grade: createdUser.grade,
          class: createdUser.class,
          status: createdUser.status,
          createdAt: createdUser.createdAt,
        });
        importedCount++;
      } catch (createErr) {
        skippedCount++;
        errors.push(`Row ${r + 1} (${name}): ${createErr.message}`);
      }
    }

    if (importedCount === 0 && skippedCount === 0) {
      return res.status(400).json({
        message: 'No student/member records found in the spreadsheet. Please add at least one student name before uploading.'
      });
    }

    return res.status(200).json({
      message: `Bulk registration completed: ${importedCount} students/members registered successfully, ${skippedCount} skipped.`,
      importedCount,
      skippedCount,
      defaultPassword,
      errors: errors.slice(0, 10),
      importedUsers,
    });
  } catch (error) {
    console.error('Bulk user import error:', error);
    res.status(500).json({ message: 'Server error during bulk member import.' });
  }
});

// POST /api/users/promote-preview - Preview students affected before executing promotion
router.post('/promote-preview', protect, authorize('librarian'), async (req, res) => {
  try {
    const { mode, sourceGrade, sourceClass, targetGrade, targetClass } = req.body;

    if (mode === 'specific') {
      if (!sourceGrade || !targetGrade) {
        return res.status(400).json({ message: 'Source Grade and Target Grade are required.' });
      }

      const query = { role: 'student', status: 'active', grade: sourceGrade };
      if (sourceClass && sourceClass !== 'all') {
        query.class = sourceClass;
      }

      const students = await User.find(query).select('memberId name grade class email');
      return res.json({
        count: students.length,
        students,
        summary: `Promoting ${students.length} student(s) from ${sourceGrade}${sourceClass && sourceClass !== 'all' ? '-' + sourceClass : ''} to ${targetGrade}${targetClass ? '-' + targetClass : ''}`
      });
    }

    if (mode === 'annual-all') {
      // Annual whole-school promotion count per grade
      const grades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Grade 13'];
      const counts = {};
      let total = 0;

      for (const g of grades) {
        const c = await User.countDocuments({ role: 'student', status: 'active', grade: g });
        counts[g] = c;
        if (!selectedGrades || selectedGrades.includes(g)) {
          total += c;
        }
      }

      return res.json({
        total,
        breakdown: counts,
        summary: `Whole school promotion will advance selected grades (${total} total students).`
      });
    }

    return res.status(400).json({ message: 'Invalid promotion mode.' });
  } catch (error) {
    console.error('Promotion preview error:', error);
    res.status(500).json({ message: 'Failed to calculate promotion preview.' });
  }
});

// POST /api/users/promote - Execute Class Promotion
router.post('/promote', protect, authorize('librarian'), async (req, res) => {
  try {
    const { mode, sourceGrade, sourceClass, targetGrade, targetClass, selectedGrades } = req.body;

    if (mode === 'specific') {
      if (!sourceGrade || !targetGrade) {
        return res.status(400).json({ message: 'Source Grade and Target Grade are required.' });
      }

      const query = { role: 'student', status: 'active', grade: sourceGrade };
      if (sourceClass && sourceClass !== 'all') {
        query.class = sourceClass;
      }

      const updateData = { grade: targetGrade };
      if (targetClass !== undefined && targetClass !== '') {
        updateData.class = targetClass;
      }

      const result = await User.updateMany(query, { $set: updateData });

      return res.json({
        message: `Successfully promoted ${result.modifiedCount} student(s) to ${targetGrade}${targetClass ? '-' + targetClass : ''}.`,
        promotedCount: result.modifiedCount,
      });
    }

    if (mode === 'annual-all') {
      // Step-by-step descending upgrade to prevent multiple promotions
      const progressionMap = [
        { from: 'Grade 13', to: 'Out of school', keepClass: false },
        { from: 'Grade 12', to: 'Grade 13', keepClass: true },
        { from: 'Grade 11', to: 'Grade 12', keepClass: false },
        { from: 'Grade 10', to: 'Grade 11', keepClass: true },
        { from: 'Grade 9', to: 'Grade 10', keepClass: true },
        { from: 'Grade 8', to: 'Grade 9', keepClass: true },
        { from: 'Grade 7', to: 'Grade 8', keepClass: true },
        { from: 'Grade 6', to: 'Grade 7', keepClass: true },
        { from: 'Grade 5', to: 'Grade 6', keepClass: true },
        { from: 'Grade 4', to: 'Grade 5', keepClass: true },
        { from: 'Grade 3', to: 'Grade 4', keepClass: true },
        { from: 'Grade 2', to: 'Grade 3', keepClass: true },
        { from: 'Grade 1', to: 'Grade 2', keepClass: true },
      ];

      let totalPromoted = 0;
      const details = [];

      for (const step of progressionMap) {
        if (selectedGrades && Array.isArray(selectedGrades) && !selectedGrades.includes(step.from)) {
          continue; // Skip grades not selected by librarian
        }

        const query = { role: 'student', status: 'active', grade: step.from };
        const count = await User.countDocuments(query);
        if (count > 0) {
          const updateObj = { grade: step.to };
          if (!step.keepClass) {
            updateObj.class = ''; // Reset section for O/L to A/L transition until stream selected
          }
          await User.updateMany(query, { $set: updateObj });
          totalPromoted += count;
          details.push(`${step.from} ➔ ${step.to} (${count} students)`);
        }
      }

      return res.json({
        message: `Promotion completed: ${totalPromoted} student(s) updated successfully.`,
        promotedCount: totalPromoted,
        details,
      });
    }

    return res.status(400).json({ message: 'Invalid promotion mode.' });
  } catch (error) {
    console.error('Execute promotion error:', error);
    res.status(500).json({ message: 'Server error during class promotion.' });
  }
});

// GET /api/users - Librarian can view all library members (students and teachers)
router.get('/', protect, authorize('librarian'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'librarian' } })
      .select('-password -resetToken -resetTokenExpiry')
      .sort({ createdAt: -1 });
    res.json({ message: 'All members', count: users.length, users });
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:id - Librarian can view a specific user
router.get('/:id', protect, authorize('librarian'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      '-password -resetToken -resetTokenExpiry'
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users - Librarian can create a new member directly (Student or Teacher)
router.post('/', protect, authorize('librarian'), async (req, res) => {
  try {
    const { name, email, password, role, grade, class: classField, stream, memberId: customMemberId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Full Name is required.' });
    }

    const cleanName = name.trim();
    const validRoles = ['student', 'teacher'];
    const userRole = role && validRoles.includes(role) ? role : 'student';

    // Auto-generate unique email if omitted
    let sanitizedEmail = email ? email.trim().toLowerCase() : '';
    if (!sanitizedEmail) {
      const namePart = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
      const idPart = customMemberId ? customMemberId.toLowerCase().replace(/[^a-z0-9]/g, '') : `${Date.now() % 100000}`;
      sanitizedEmail = `${userRole}.${namePart || 'member'}.${idPart}@kmv.edu`;
    }

    const userExists = await User.findOne({ email: sanitizedEmail });
    if (userExists) {
      if (userExists.status === 'rejected') {
        await User.deleteOne({ _id: userExists._id });
      } else {
        return res.status(400).json({ message: `A member with email "${sanitizedEmail}" already exists.` });
      }
    }

    // If custom Member ID provided, verify uniqueness
    if (customMemberId && customMemberId.trim()) {
      const idExists = await User.findOne({ memberId: customMemberId.trim() });
      if (idExists) {
        return res.status(400).json({ message: `Member ID "${customMemberId.trim()}" is already in use.` });
      }
    }

    const userPassword = (password && password.trim().length >= 6) ? password.trim() : 'Kmv@1234';

    const newUserData = {
      name: cleanName,
      email: sanitizedEmail,
      phone: (req.body.phone || '').trim(),
      password: userPassword,
      role: userRole,
      grade: userRole === 'teacher' ? 'Teacher' : (grade || 'Grade 6'),
      class: userRole === 'teacher' ? '' : (classField || ''),
      stream: userRole === 'teacher' ? '' : (stream || ''),
      status: 'active',
    };

    if (customMemberId && customMemberId.trim()) {
      newUserData.memberId = customMemberId.trim();
    }

    const user = await User.create(newUserData);

    res.status(201).json({
      message: 'Member created successfully',
      user: {
        _id: user._id,
        memberId: user.memberId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        grade: user.grade,
        class: user.class,
        stream: user.stream,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Create user error:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/users/:id - Librarian can update user info (name, email, phone, grade, class, status, role)
router.put('/:id', protect, authorize('librarian'), async (req, res) => {
  try {
    const { name, email, phone, grade, class: classField, stream, status, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (grade !== undefined) user.grade = grade;
    if (classField !== undefined) user.class = classField;
    if (stream !== undefined) user.stream = stream;
    if (status) {
      const validStatuses = ['pending', 'active', 'rejected'];
      if (validStatuses.includes(status)) user.status = status;
    }
    if (role) {
      const validRoles = ['student', 'teacher'];
      if (validRoles.includes(role)) {
        user.role = role;
        if (role === 'teacher') {
          user.grade = 'Teacher';
          user.class = '';
          user.stream = '';
        }
      }
    }

    await user.save();
    res.json({
      message: 'User updated',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        grade: user.grade,
        class: user.class,
        stream: user.stream,
        status: user.status,
        role: user.role,
        memberId: user.memberId
      }
    });
  } catch (error) {
    console.error('Update user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/:id/role - Librarian can change user role
router.put('/:id/role', protect, authorize('librarian'), async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['student', 'teacher', 'librarian'];

    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ message: 'Role must be: student, teacher, or librarian' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent librarian from demoting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }

    user.role = role;
    await user.save();

    res.json({ message: `User role changed to "${role}"`, user: { name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Change role error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id - Librarian can delete a user
router.delete('/:id', protect, authorize('librarian'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent librarian from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    // Check if the user has active checkouts
    const activeTx = await Transaction.findOne({
      user: user._id,
      status: { $in: ['active', 'overdue'] },
      returnDate: null
    });

    if (activeTx) {
      return res.status(400).json({
        message: 'Cannot delete user. Member currently has active or overdue book checkouts. Please return all books first.'
      });
    }

    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
