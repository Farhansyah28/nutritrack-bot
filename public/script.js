document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-btn');
  const tbody = document.getElementById('users-tbody');
  const totalUsersEl = document.getElementById('total-users');
  const activeTodayEl = document.getElementById('active-today');

  async function fetchUsers() {
    try {
      refreshBtn.classList.add('loading');
      refreshBtn.innerText = '⏳ Loading...';
      
      const response = await fetch('/api/users');
      
      if (response.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      
      const users = await response.json();
      
      renderUsers(users);
      updateStats(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #ef4444;">Failed to load users. Is the bot running?</td></tr>';
    } finally {
      refreshBtn.classList.remove('loading');
      refreshBtn.innerText = '🔄 Refresh';
    }
  }

  function renderUsers(users) {
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No users found yet.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isCompleted = u.onboarding_step === 'completed';
      const badgeClass = isCompleted ? 'completed' : 'pending';
      const statusText = isCompleted ? 'Active' : 'Onboarding';
      
      const targetMacros = isCompleted 
        ? `${u.target_protein}g / ${u.target_carbs}g / ${u.target_fat}g` 
        : '-';
        
      const bodyInfo = isCompleted 
        ? `${u.weight} kg / ${u.height} cm` 
        : '-';

      const genderAge = isCompleted
        ? `${u.gender === 'L' ? 'Male' : 'Female'} / ${u.age} y.o`
        : '-';

      return `
        <tr>
          <td>#${u.telegram_id}</td>
          <td style="font-weight: 600;">${u.first_name}</td>
          <td>${genderAge}</td>
          <td>${bodyInfo}</td>
          <td>${isCompleted ? u.target_calories + ' kcal' : '-'}</td>
          <td style="color: #94a3b8;">${targetMacros}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
          <td>${new Date(u.created_at + 'Z').toLocaleString('id-ID')}</td>
        </tr>
      `;
    }).join('');
  }

  function updateStats(users) {
    totalUsersEl.innerText = users.length;
    const active = users.filter(u => u.onboarding_step === 'completed').length;
    activeTodayEl.innerText = active;
  }

  refreshBtn.addEventListener('click', fetchUsers);
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }

  // Initial fetch
  fetchUsers();
});
