const ExcelJS = require('exceljs');
const path = require('path');

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kawudulla Central College Library';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Members & Students', {
    views: [{ showGridLines: true }]
  });

  // Set column widths
  worksheet.columns = [
    { key: 'colA', width: 24 },
    { key: 'colB', width: 28 },
    { key: 'colC', width: 16 },
    { key: 'colD', width: 24 },
    { key: 'colE', width: 24 },
  ];

  // Row 1: Instructions Title
  const row1 = worksheet.getRow(1);
  row1.getCell(1).value = '📌 INSTRUCTIONS:';
  row1.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF9E0D0D' } };
  row1.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' }
  };

  // Rows 2-4: Instruction Steps
  const instructions = [
    '1. Full Name and Grade are required for students. For teachers, leave Grade blank.',
    '2. For Grades 1-11, enter Section as A, B, C, D, etc. For Grades 12-13, enter stream (e.g. Physical Science, Bio Science, Commerce, Arts, Technology).',
    '3. Admission/Member ID is optional. If left blank, system generates KMV-0001, KMV-0002... for students and KMV-T001, KMV-T002... for teachers.'
  ];

  instructions.forEach((inst, idx) => {
    const r = worksheet.getRow(idx + 2);
    r.getCell(1).value = inst;
    r.getCell(1).font = { name: 'Calibri', size: 10, italic: false };
  });

  // Row 5: Empty
  worksheet.getRow(5).values = [];

  // Row 6: Headers with Maroon/Dark Red Theme
  const headerRow = worksheet.getRow(6);
  headerRow.values = [
    'Admission / Member ID',
    'Full Name *',
    'Grade *',
    'Class / Section',
    'Role (student/teacher)'
  ];

  headerRow.height = 26;
  for (let c = 1; c <= 5; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9E0D0D' } // Maroon Theme
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  }

  // Rows 7-9: Sample Data matching student KMV-0001 and teacher KMV-T001 format
  const sampleData = [
    ['KMV-0001', 'Kasun Chamara', 'Grade 6', 'A', 'student'],
    ['KMV-0002', 'Dilani Kumari', 'Grade 12', 'Physical Science', 'student'],
    ['KMV-T001', 'Mrs. Jayasinghe', '', '', 'teacher']
  ];

  sampleData.forEach((rowVals, idx) => {
    const dataRow = worksheet.getRow(idx + 7);
    dataRow.values = rowVals;
    dataRow.height = 20;
    for (let c = 1; c <= 5; c++) {
      const cell = dataRow.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  });

  const publicPath = path.resolve(__dirname, '..', '..', 'client', 'public', 'library_member_import_template.xlsx');
  const buildPath = path.resolve(__dirname, '..', '..', 'client', 'build', 'library_member_import_template.xlsx');
  await workbook.xlsx.writeFile(publicPath);
  await workbook.xlsx.writeFile(buildPath);
  console.log('Template generated successfully at:', publicPath);
  console.log('Template generated successfully at:', buildPath);
}

generateTemplate().catch(console.error);
