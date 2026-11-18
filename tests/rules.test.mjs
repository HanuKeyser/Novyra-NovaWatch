// Security rules: Novyra (top level) and each company (companies/<id>/) must never see each other's records.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({ projectId: 'novyra-studio', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
const as = (email, verified = true) => env.authenticatedContext(email.replace(/\W/g, '_'), { email, email_verified: verified }).firestore();
const anon = env.unauthenticatedContext().firestore();
const future = Timestamp.fromDate(new Date(Date.now() + 7 * 864e5));
const openQuote = { kind: 'quote', status: 'Open', validTs: future, rev: 1, total: 4000 };

await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'clients/n1'), { business: 'Novyra customer' });
  await setDoc(doc(db, 'shares/novkey1234567890ab'), openQuote);
  await setDoc(doc(db, 'companies/karoo'), { name: 'Karoo Cycles', owners: ['owner@karoo.test'] });
  await setDoc(doc(db, 'companies/karoo/clients/k1'), { business: 'Karoo customer' });
  await setDoc(doc(db, 'companies/karoo/settings/business'), { name: 'Karoo Cycles' });
  await setDoc(doc(db, 'companies/karoo/users/staff@karoo.test'), { email: 'staff@karoo.test', role: 'staff', active: true });
  await setDoc(doc(db, 'companies/karoo/users/viewer@karoo.test'), { email: 'viewer@karoo.test', role: 'viewer', active: true });
  await setDoc(doc(db, 'companies/karoo/users/gone@karoo.test'), { email: 'gone@karoo.test', role: 'staff', active: false });
  await setDoc(doc(db, 'companies/karoo/shares/karkey1234567890ab'), openQuote);
  await setDoc(doc(db, 'companies/fern'), { name: 'Fern & Field', owners: ['owner@fern.test'] });
  await setDoc(doc(db, 'companies/fern/clients/f1'), { business: 'Fern customer' });
});

const hanu = as('hanu@keysers.cc'), hanuG = as('HanuKeyser@gmail.com'), karoo = as('owner@karoo.test'), fern = as('owner@fern.test');
const staff = as('staff@karoo.test'), viewer = as('viewer@karoo.test'), gone = as('gone@karoo.test'), unverified = as('owner@karoo.test', false), stranger = as('someone@else.test');
let n = 0, bad = 0;
const t = async (name, p) => { n++; try { await p; console.log('  ok  ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + ' :: ' + (e && e.message || e)); } };

console.log('Novyra (novyradesk.com)');
await t('Novyra owner reads Novyra customers', assertSucceeds(getDoc(doc(hanu, 'clients/n1'))));
await t('Novyra owner (Gmail login, any letter case) reads Novyra customers', assertSucceeds(getDoc(doc(hanuG, 'clients/n1'))));
await t('Novyra owner writes Novyra records', assertSucceeds(setDoc(doc(hanu, 'quotes/q1'), { n: 1 })));
await t('Novyra owner cannot read a company’s customers', assertFails(getDoc(doc(hanu, 'companies/karoo/clients/k1'))));
await t('Novyra owner cannot list a company’s customers', assertFails(getDocs(collection(hanu, 'companies/karoo/clients'))));
await t('Novyra owner cannot write inside a company', assertFails(setDoc(doc(hanu, 'companies/karoo/clients/x'), { a: 1 })));
await t('Novyra owner cannot read a company’s settings', assertFails(getDoc(doc(hanu, 'companies/karoo/settings/business'))));
await t('Novyra owner can list companies', assertSucceeds(getDocs(collection(hanu, 'companies'))));
await t('Novyra owner can set up a company', assertSucceeds(setDoc(doc(hanu, 'companies/new-co'), { name: 'New Co', owners: ['boss@new.test'] })));
await t('Company address must be valid', assertFails(setDoc(doc(hanu, 'companies/Bad Name'), { name: 'X', owners: ['a@b.test'] })));
await t('A company needs an owner', assertFails(setDoc(doc(hanu, 'companies/no-owner'), { name: 'X', owners: [] })));
await t('Novyra owner cannot take over an existing company', assertFails(setDoc(doc(hanu, 'companies/karoo'), { name: 'Karoo', owners: ['hanu@keysers.cc'] })));

console.log('A company (novyradesk.com/karoo/)');
await t('Company owner reads its company', assertSucceeds(getDoc(doc(karoo, 'companies/karoo'))));
await t('Company owner reads its customers', assertSucceeds(getDocs(collection(karoo, 'companies/karoo/clients'))));
await t('Company owner writes its records', assertSucceeds(setDoc(doc(karoo, 'companies/karoo/quotes/q1'), { n: 1 })));
await t('Company owner adds team members', assertSucceeds(setDoc(doc(karoo, 'companies/karoo/users/new@karoo.test'), { email: 'new@karoo.test', role: 'staff', active: true })));
await t('Company owner lists its customer links', assertSucceeds(getDocs(collection(karoo, 'companies/karoo/shares'))));
await t('Company owner creates a customer link', assertSucceeds(setDoc(doc(karoo, 'companies/karoo/shares/abcabcabcabcabcabc'), openQuote)));
await t('Company owner cannot read Novyra’s customers', assertFails(getDoc(doc(karoo, 'clients/n1'))));
await t('Company owner cannot list Novyra’s customers', assertFails(getDocs(collection(karoo, 'clients'))));
await t('Company owner cannot write Novyra’s records', assertFails(setDoc(doc(karoo, 'clients/x'), { a: 1 })));
await t('Company owner cannot list Novyra’s customer links', assertFails(getDocs(collection(karoo, 'shares'))));
await t('Company owner cannot read another company', assertFails(getDoc(doc(karoo, 'companies/fern'))));
await t('Company owner cannot read another company’s customers', assertFails(getDoc(doc(karoo, 'companies/fern/clients/f1'))));
await t('Company owner cannot list companies', assertFails(getDocs(collection(karoo, 'companies'))));
await t('Company owner cannot set up companies', assertFails(setDoc(doc(karoo, 'companies/sneaky'), { name: 'S', owners: ['owner@karoo.test'] })));
await t('Other company cannot read this company', assertFails(getDocs(collection(fern, 'companies/karoo/clients'))));
await t('Unconfirmed email cannot get in', assertFails(getDoc(doc(unverified, 'companies/karoo/clients/k1'))));
await t('Someone not on the team cannot get in', assertFails(getDoc(doc(stranger, 'companies/karoo/clients/k1'))));

console.log('A company’s team');
await t('Staff read customers', assertSucceeds(getDoc(doc(staff, 'companies/karoo/clients/k1'))));
await t('Staff write quotes', assertSucceeds(setDoc(doc(staff, 'companies/karoo/quotes/q2'), { n: 2 })));
await t('Staff cannot change the team', assertFails(setDoc(doc(staff, 'companies/karoo/users/x@karoo.test'), { role: 'admin', active: true })));
await t('Staff cannot change the company’s owners', assertFails(updateDoc(doc(staff, 'companies/karoo'), { owners: ['staff@karoo.test'] })));
await t('Staff cannot read Novyra', assertFails(getDoc(doc(staff, 'clients/n1'))));
await t('Viewer reads customers', assertSucceeds(getDoc(doc(viewer, 'companies/karoo/clients/k1'))));
await t('Viewer cannot write', assertFails(setDoc(doc(viewer, 'companies/karoo/quotes/q3'), { n: 3 })));
await t('Turned-off team member cannot get in', assertFails(getDoc(doc(gone, 'companies/karoo/clients/k1'))));

console.log('Customers opening links');
await t('Customer opens a Novyra link', assertSucceeds(getDoc(doc(anon, 'shares/novkey1234567890ab'))));
await t('Customer opens a company link', assertSucceeds(getDoc(doc(anon, 'companies/karoo/shares/karkey1234567890ab'))));
await t('Customer cannot list a company’s links', assertFails(getDocs(collection(anon, 'companies/karoo/shares'))));
await t('Customer cannot read a company’s customers', assertFails(getDoc(doc(anon, 'companies/karoo/clients/k1'))));
await t('Customer cannot read the company record', assertFails(getDoc(doc(anon, 'companies/karoo'))));
await t('Customer cannot change the price on a quote', assertFails(updateDoc(doc(anon, 'companies/karoo/shares/karkey1234567890ab'), { total: 1 })));
await t('Customer accepts a company quote', assertSucceeds(updateDoc(doc(anon, 'companies/karoo/shares/karkey1234567890ab'), { status: 'Accepted', response: { name: 'Thabo', note: '', at: new Date().toISOString(), rev: 1 } })));
await t('Customer cannot answer twice', assertFails(updateDoc(doc(anon, 'companies/karoo/shares/karkey1234567890ab'), { status: 'Declined', response: { name: 'Thabo', note: '', at: 'x', rev: 1 } })));
await t('Customer accepts a Novyra quote', assertSucceeds(updateDoc(doc(anon, 'shares/novkey1234567890ab'), { status: 'Accepted', response: { name: 'Lerato', note: '', at: new Date().toISOString(), rev: 1 } })));
await t('Customer cannot delete a link', assertFails(deleteDoc(doc(anon, 'companies/karoo/shares/abcabcabcabcabcabc'))));

await env.cleanup();
console.log(`\nRules: ${n - bad} of ${n} checks passed`);
if (bad) process.exit(1);
