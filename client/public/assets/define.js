document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('guestName');
    const btn = document.getElementById('continueBtn');
    const errMSG = document.getElementById('errMSG')

    btn.addEventListener('click', async() => {
        const guestName = nameInput.value.trim()
        console.log('inputed name is: ',guestName);

        if (!/^[A-Za-z]{2,}$/.test(guestName)) {
            // still not working in test
            console.log("setting error")
            errMSG.textContent='Enter a valid name please';
            return;
        }
    })
})




















// public/js/validate.js
// document.addEventListener('DOMContentLoaded', () => {
//   const nameInput = document.getElementById('guestName');
//   const btn       = document.getElementById('continueBtn');
// 
//   btn.addEventListener('click', async () => {
//     const name = nameInput.value.trim();
//     // allow letters & spaces only, at least 2 chars
//     if (!/^[A-Za-z\s]{2,}$/.test(name)) {
//       return alert('Enter a valid name (letters & spaces only, min. 2 characters).');
//     }
// 
//     try {
//       const res = await fetch('/api/party/define', {
//         method:  'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body:    JSON.stringify({ name })
//       });
//       const body = await res.json();
// 
//       if (!res.ok) {
//         return alert(body.error || 'Server error.');
//       }
//       // success → redirect or show next step
//       window.location.href = '/'; 
//     } catch (err) {
//       console.error(err);
//       alert('Network error—please try again.');
//     }
//   });
// });