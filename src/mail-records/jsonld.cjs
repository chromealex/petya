// schema.org JSON-LD (Gmail markup) → mail records. Reservations: FlightReservation, LodgingReservation,
// TrainReservation, BusReservation, RentalCarReservation, EventReservation; purchases: Order, Invoice (a billing
// period or an offer's billing duration makes it a subscription). Cancelled reservations are dropped.

const str=v=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const name=v=>Array.isArray(v)?name(v[0]):v&&typeof v==='object'?str(v.name)||str(v.iataCode)||str(v.legalName):str(v);
const type=v=>[].concat(v?.['@type']||[]).map(String).map(t=>t.replace(/^https?:\/\/schema\.org\//,''));
// A schema.org DateTime → {date:'YYYY-MM-DD', time:'HH:MM'|''} in its own written local time (no zone shift).
function when(v){const m=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(str(v));return m?{date:m[1]+'-'+m[2]+'-'+m[3],time:m[4]?m[4]+':'+m[5]:''}:null;}
const money=(price,currency)=>{const n=Number(String(price??'').replace(/[^\d.,-]/g,'').replace(',','.'));const c=str(currency).toUpperCase();return Number.isFinite(n)&&n>0&&/^[A-Z]{3}$/.test(c)?{amount:Math.round(n*100)/100,currency:c}:null;};
// ISO 8601 durations and UN/CEFACT unit codes → period.
function period(v){
 const s=str(v?.billingDuration??v?.eligibleDuration?.value??v?.billingPeriod??v?.unitCode??v).toUpperCase();
 if(/^P1M$|^MON$|MONTH/.test(s))return 'month';if(/^P1Y$|^P12M$|^ANN$|YEAR/.test(s))return 'year';if(/^P1W$|^P7D$|^WEE$|WEEK/.test(s))return 'week';if(/^P3M$|QUARTER/.test(s))return 'quarter';
 return null;
}
const cancelled=o=>/Cancel/i.test(str(o.reservationStatus));
function reservation(o,t){
 const r=o.reservationFor||{};const code=str(o.reservationNumber)||str(o.confirmationNumber)||str(o.reservationId);
 const base={type:'booking',evidence:{source:'JSON-LD '+t},booking:{code}};
 if(t==='FlightReservation'){const dep=when(r.departureTime),arr=when(r.arrivalTime);const airline=name(r.airline);const number=[str(r.airline?.iataCode),str(r.flightNumber)].filter(Boolean).join(' ').replace(/^(\w+) \1/,'$1');
  return {...base,merchant:airline||name(o.provider)||'Авиабилет',date:dep?.date||'',booking:{kind:'flight',code,number,from:name(r.departureAirport),to:name(r.arrivalAirport),start:dep?.date||'',startTime:dep?.time||'',end:arr?.date||'',endTime:arr?.time||''}};}
 if(t==='LodgingReservation'){const a=when(o.checkinDate||o.checkinTime),b=when(o.checkoutDate||o.checkoutTime);const addr=r.address&&typeof r.address==='object'?[str(r.address.addressLocality),str(r.address.addressCountry?.name||r.address.addressCountry)].filter(Boolean).join(', '):str(r.address);
  return {...base,merchant:name(r)||name(o.provider)||'Отель',date:a?.date||'',booking:{kind:'hotel',code,place:[name(r),addr].filter(Boolean).join(' · '),start:a?.date||'',startTime:a?.time||'',end:b?.date||'',endTime:b?.time||''}};}
 if(t==='TrainReservation'||t==='BusReservation'){const dep=when(r.departureTime),arr=when(r.arrivalTime);const kind=t==='TrainReservation'?'train':'bus';
  return {...base,merchant:name(r.provider)||name(o.provider)||name(o.broker)||(kind==='train'?'Поезд':'Автобус'),date:dep?.date||'',booking:{kind,code,number:str(r.trainNumber||r.busNumber),from:name(r.departureStation||r.departureBusStop),to:name(r.arrivalStation||r.arrivalBusStop),start:dep?.date||'',startTime:dep?.time||'',end:arr?.date||'',endTime:arr?.time||''}};}
 if(t==='RentalCarReservation'){const a=when(o.pickupTime),b=when(o.dropoffTime);
  return {...base,merchant:name(r.rentalCompany)||name(o.provider)||'Аренда авто',date:a?.date||'',booking:{kind:'car',code,from:name(o.pickupLocation),to:name(o.dropoffLocation),start:a?.date||'',startTime:a?.time||'',end:b?.date||'',endTime:b?.time||''}};}
 if(t==='EventReservation'){const a=when(r.startDate),b=when(r.endDate);
  return {...base,merchant:name(r)||'Событие',date:a?.date||'',booking:{kind:'event',code,place:name(r.location),start:a?.date||'',startTime:a?.time||'',end:b?.date||'',endTime:b?.time||''}};}
 return null;
}
function purchase(o,t){
 const offers=[].concat(o.acceptedOffer||o.offers||[]).filter(x=>x&&typeof x==='object');
 const total=money(o.totalPaymentDue?.price??o.totalPaymentDue?.value??o.price,o.totalPaymentDue?.priceCurrency??o.totalPaymentDue?.currency??o.priceCurrency)
  ||money(offers[0]?.price,offers[0]?.priceCurrency);
 const item=name(offers[0]?.itemOffered)||name(o.referencesOrder?.orderedItem);
 const merchant=name(o.merchant)||name(o.seller)||name(o.provider)||name(offers[0]?.seller)||item;
 if(!merchant||!total)return null;
 const p=period(o.billingPeriod?{billingPeriod:o.billingPeriod}:null)||period(offers[0]?.priceSpecification)||period(offers[0]?.eligibleDuration?{eligibleDuration:offers[0].eligibleDuration}:null);
 const date=when(o.orderDate||o.paymentDueDate||o.dateCreated)?.date||'';
 return {type:p?'subscription':'receipt',merchant:p&&item&&item!==merchant&&/apple|google|app store|play/i.test(merchant)?item:merchant,item:item&&item!==merchant?item:'',amount:total.amount,currency:total.currency,period:p,
  date,nextCharge:t==='Invoice'?when(o.paymentDueDate)?.date||'':'',order:str(o.orderNumber||o.confirmationNumber||o.identifier),evidence:{source:'JSON-LD '+t}};
}
function records(objects){
 const out=[];
 for(const o of objects||[]){
  for(const t of type(o)){
   if(/Reservation$/.test(t)){if(cancelled(o))continue;const r=reservation(o,t);if(r)out.push(r);}
   else if(t==='Order'||t==='Invoice'){const r=purchase(o,t);if(r)out.push(r);}
  }
 }
 return out;
}
module.exports={records,when,period};
