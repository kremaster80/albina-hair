import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDikidiBookingEmail } from './dikidi-email.mjs';

test('extracts a new booking without inventing an appointment ID or year', () => {
  const message='Здравствуйте.\n\nСоздана новая запись к Мария Примерова на 23.11 в 17:00 (2 часа 30 минут). Клиент: Тест Клиент 79260000000';
  assert.deepEqual(parseDikidiBookingEmail(message),{
    type:'booking_created',
    master:'Мария Примерова',
    clientName:'Тест Клиент',
    clientPhone:'+79260000000',
    day:23,month:11,localTime:'17:00',durationMinutes:150,
    year:null,bookingId:null,service:null
  });
});
test('handles a one-hour booking and converts 8-prefix phone',()=>{
  const m='Создана новая запись к Анна Смирнова на 01.12 в 09:05 (1 час). Клиент: Иван Тестов 89260000000';
  const r=parseDikidiBookingEmail(m);
  assert.equal(r.durationMinutes,60);
  assert.equal(r.localTime,'09:05');
  assert.equal(r.clientPhone,'+79260000000');
});
test('rejects unrelated emails and invalid schedule details',()=>{
  const good='Создана новая запись к Анна Смирнова на 23.11 в 17:00 (2 часа 30 минут). Клиент: Иван Тестов 79260000000';
  for(const m of [
    good.replace('Создана новая запись','Отменена запись'),
    good.replace('23.11','33.11'),
    good.replace('17:00','28:00'),
    good.replace('2 часа 30 минут','0 минут'),
    good.replace('79260000000','abc'),
    'Здравствуйте. Войдите по ссылке https://example.org'
  ]) assert.equal(parseDikidiBookingEmail(m),null,m);
});
test('does not carry private data from an unrecognised notification',()=>{
  assert.equal(parseDikidiBookingEmail('Изменена запись. Клиент: Тест Клиент 79260000000'),null);
});
