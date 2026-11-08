// Roles offered in the first-run introduction. The extension catalog is being reworked around roles; when it
// declares its own role list, read it from there and keep these ids (they are stored in settings.userRole).
module.exports = [
  { id: 'developer', label: 'Разработчик' },
  { id: 'unity', label: 'Unity-разработчик' },
  { id: 'designer', label: 'Дизайнер / художник' },
  { id: 'manager', label: 'Менеджер / продюсер' },
  { id: 'qa', label: 'QA' },
  { id: 'analyst', label: 'Аналитик' },
  { id: 'lead', label: 'Лид' }
];
